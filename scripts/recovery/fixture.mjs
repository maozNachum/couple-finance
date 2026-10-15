import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { readState, sql, status, run, root, backup, saveState } from './local-drill.mjs';
import { sha256, requireThat } from './guard.mjs';

export function client(s, admin = false) {
  return createClient(s.API_URL, admin ? s.SERVICE_ROLE_KEY : s.ANON_KEY, { db: { schema: 'api' }, auth: { persistSession: false, autoRefreshToken: false } });
}
async function rpc(c, name, payload) {
  const r = await c.rpc(name, payload === undefined ? undefined : { payload });
  requireThat(!r.error && r.data?.ok, `RPC_FAILED_${name.toUpperCase()}`);
  return r.data;
}
export function fingerprint(state) {
  // Text canonicalization stays in PostgreSQL: no JS floating-point conversion of numeric values.
  const rows = sql(state, `begin isolation level repeatable read read only;
    select format('select %L || ''|'' || count(*) || ''|'' || encode(extensions.digest(coalesce(string_agg(to_jsonb(t)::text, E''\\n'' order by to_jsonb(t)::text), ''''), ''sha256''), ''hex'') from %I.%I t;', n.nspname||'.'||c.relname,n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('finance','private','supabase_migrations') and c.relkind='r' order by n.nspname,c.relname
    \\gexec
    commit;`);
  return rows.split('\n').filter(s => /^(finance|private|supabase_migrations)\./.test(s));
}
export async function objects(state) {
  const s = status(state), admin = client(s, true);
  const rows = JSON.parse(sql(state, "select coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name) order by bucket_id,name),'[]'::json) from storage.objects;"));
  for (const row of rows) {
    const result = await admin.storage.from(row.bucket).download(row.name);
    requireThat(!result.error && result.data, 'STORAGE_OBJECT_MISSING');
    const bytes = Buffer.from(await result.data.arrayBuffer()); row.bytes = bytes.length; row.sha256 = sha256(bytes);
  }
  return rows;
}
export function calculations(snapshot, request) {
  return JSON.parse(run(process.execPath, ['--experimental-strip-types', join(root, 'scripts/recovery/calculate.mjs')], { input: JSON.stringify({ snapshot, request }) }));
}
function normalized(snapshot) { return { ...snapshot, capturedAt: '2026-10-15T00:00:00Z' }; }
async function login(admin, c, email) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  requireThat(!link.error && link.data.properties, 'RECOVERY_LINK_FAILED');
  requireThat(!(await c.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'email' })).error, 'RECOVERY_LOGIN_FAILED');
}
export async function seed(lab) {
  const state = readState(lab), s = status(state);
  requireThat(state.phase === 'RUNNING' && state.project.endsWith('-source'), 'REFUSED_FIXTURE_TARGET');
  requireThat(sql(state, 'select count(*) from finance.households; select count(*) from auth.users;') === '0\n0', 'FIXTURE_REQUIRES_EMPTY_SOURCE');
  // Existing fixture helpers intentionally resolve CLI status from cwd.
  // Bind them to the verified transformed workdir, never the retained root project.
  process.chdir(state.workdir);
  const { obligationFixture } = await import(pathToFileURL(join(state.workdir, 'tests/integration/obligation-fixture.mjs')).href);
  const f = await obligationFixture(), admin = client(s, true);
  let checks = 0;
  const eq = (a,b,label) => { assert.deepEqual(a,b,label); checks++; };
  const h = f.households[0];
  const extraEmail = `synthetic-partner-${randomUUID()}@example.test`;
  const invitation = await admin.auth.admin.generateLink({ type: 'invite', email: extraEmail });
  eq(invitation.error, null, 'explicit second member invite');
  const partnerId = invitation.data.user.id, partner = client(s);
  sql(state, `begin; insert into finance.profiles(id,display_name) values ('${partnerId}','Synthetic partner'); insert into finance.household_members(household_id,user_id,display_name) values ('${h}','${partnerId}','Synthetic partner'); commit;`);
  eq((await partner.auth.verifyOtp({ type: 'invite', token_hash: invitation.data.properties.hashed_token })).error, null, 'invitation works once');
  eq((await client(s).auth.verifyOtp({ type: 'invite', token_hash: invitation.data.properties.hashed_token })).error !== null, true, 'reused invitation rejected');
  eq((await client(s).auth.verifyOtp({ type: 'invite', token_hash: 'invalid-token' })).error !== null, true, 'invalid invitation rejected');
  const members = JSON.parse(sql(state, `select json_agg(json_build_object('id',id,'userId',user_id) order by id) from finance.household_members where household_id='${h}';`));
  const aMember = members.find(m=>m.userId===f.users[0].id).id, bMember = members.find(m=>m.userId===partnerId).id;
  const expense = await f.save(f.bank, '-12.12345678', 'EXPENSE', null, { transactionDate: '2026-10-02', description: 'Synthetic immutable original' });
  const revision = { ...expense, revisionId: randomUUID(), supersedesRevisionId: expense.revisionId, expectedVersion: 1, idempotencyKey: randomUUID(), reason: 'Synthetic explicit correction', transaction: { ...expense.transaction, description: 'Synthetic corrected description' } };
  eq((await rpc(f.a, 'record_transaction', revision)).ok, true, 'immutable correction');
  const category = { id: randomUUID(), householdId: h, name: 'Synthetic category', kind: 'EXPENSE', status: 'ACTIVE', version: 1 };
  const definition=await rpc(f.a,'save_categorization_definition',{ kind:'CATEGORY',record:category,idempotencyKey:randomUUID() });
  eq(definition.ok,true,'category');
  eq((await rpc(f.a,'categorize_transaction',{householdId:h,accountId:f.bank.account.id,transactionId:expense.transaction.id,allocationId:expense.transaction.allocations[0].id,expectedVersion:2,supersedesRevisionId:revision.revisionId,revisionId:randomUUID(),generation:definition.generation,idempotencyKey:randomUUID(),action:'ASSIGN',categoryId:category.id,ruleId:null})).ok,true,'immutable categorization evidence and lock');
  const budget = { id:randomUUID(), householdId:h,month:'2026-10',scope:{kind:'MEMBER',memberId:aMember,categoryId:category.id},planned:{amount:'100.00000001',currency:'ILS'},action:'CREATE',expectedVersion:0,idempotencyKey:randomUUID() };
  eq((await rpc(f.a,'save_budget',budget)).ok,true,'personal category budget');
  eq((await rpc(f.a,'save_budget',{...budget,action:'EDIT',expectedVersion:1,planned:{amount:'110.00000001',currency:'ILS'},idempotencyKey:randomUUID()})).ok,true,'budget immutable edit');
  const personal = f.movement(f.bank,'-7.00000001','EXPENSE',null,{transactionDate:'2026-10-04'});
  personal.transaction.allocations[0].ownership={kind:'MEMBER',memberId:bMember};
  eq((await rpc(f.a,'record_transaction',personal)).ok,true,'partner allocation differs from account ownership');
  const c = f.command(); eq((await rpc(f.a,'obligation_command',c)).ok,true,'confirmed obligation');
  const actual=await f.save(f.bank,'-10','EXPENSE',null,{transactionDate:'2026-09-30'});
  eq((await rpc(f.a,'obligation_command',f.match(c,actual))).ok,true,'payment association');
  const other = await f.account('SAVINGS');
  const opening = f.movement(other,'50','ADJUSTMENT',null,{transactionDate:'2026-01-01'});
  eq((await rpc(f.a,'record_transaction',{...opening,entryKind:'OPENING',openingCoverage:'COMPLETE'})).ok,true,'second ledger opening');
  const payment = await f.save(f.bank,'-25'), counterpart = await f.save(other,'25');
  eq((await rpc(f.a,'reconcile',f.link([f.participant(payment,f.bank,'PAYMENT'),f.participant(counterpart,other)]))).ok,true,'reconciliation decision');
  const observed={account:{id:randomUUID(),householdId:h,name:'Synthetic historical USD',ownership:{kind:'MEMBER',memberId:bMember},type:'INVESTMENT',currency:'USD',valuationCurrency:'ILS',balancePolicy:'OBSERVED',status:'ACTIVE'},version:1,manualSourceId:randomUUID()};
  eq((await rpc(f.a,'create_account',observed)).ok,true,'observed member account');
  const fx={id:randomUUID(),base:'USD',quote:'ILS',rate:'3.712345678901',effectiveDate:'2026-10-01',recordedAt:'2026-10-01T00:00:00Z',origin:{kind:'MANUAL',sourceId:observed.manualSourceId}};
  eq((await rpc(f.a,'record_balance',{id:randomUUID(),householdId:h,accountId:observed.account.id,sourceId:observed.manualSourceId,date:'2026-10-01',money:{amount:'123.12345678',currency:'USD'},coverage:'COMPLETE',supersedesId:null,note:'Synthetic original FX',fx})).ok,true,'dated historical FX evidence');
  const content=Buffer.from('date,description,amount,ref\n2026-10-03,Synthetic retained import,-3.00000001,synthetic-ref');
  const upload=(await rpc(f.a,'import_command',{action:'AUTHORIZE',id:randomUUID(),householdId:h,accountId:f.bank.account.id,sourceId:f.bank.manualSourceId,filename:'synthetic-recovery.csv',bytes:content.length})).upload;
  eq((await f.a.storage.from('import-preview').upload(upload.path,content,{contentType:'text/csv',upsert:false})).error,null,'private Storage bytes');
  const review=await f.a.functions.invoke('import-commit',{body:{action:'REVIEW',id:upload.id,format:{encoding:'UTF-8',delimiter:','},mapping:{date:0,description:1,amount:2,debit:null,credit:null,currency:null,reference:3,supplementary:null,dateFormat:'YYYY-MM-DD',decimal:'.',grouping:'NONE',sign:'POSITIVE_INCREASES',fixedCurrency:'ILS'}}});
  eq(review.error,null,'real Edge review'); requireThat(review.data.review,'REVIEW_FAILED');
  const commit={action:'COMMIT',reviewId:review.data.review.id,idempotencyKey:randomUUID(),decisions:review.data.review.preview.rows.map(row=>({row:row.row,include:true,effect:'EXPENSE',status:'POSTED',acknowledge:true}))};
  const committed=await f.a.functions.invoke('import-commit',{body:commit});
  eq(committed.error,null,'real Edge commit'); eq(committed.data.ok,true,'durable accepted import provenance');
  eq((await f.b.storage.from('import-preview').download(upload.path)).error!==null,true,'foreign Storage denied');
  eq((await f.anon.storage.from('import-preview').download(upload.path)).error!==null,true,'anonymous Storage denied');
  eq((await f.a.storage.from('import-preview').createSignedUrl(upload.path,60)).error!==null,true,'bearer signing denied');
  const revokedEmail=`synthetic-revoked-${randomUUID()}@example.test`;
  const revokedInvite=await admin.auth.admin.generateLink({type:'invite',email:revokedEmail});
  eq(revokedInvite.error,null,'synthetic pre-backup revocation identity');
  sql(state,`begin; insert into finance.profiles(id,display_name) values('${revokedInvite.data.user.id}','Synthetic revoked'); insert into finance.household_members(household_id,user_id,display_name,status) values('${h}','${revokedInvite.data.user.id}','Synthetic revoked','REVOKED'); commit;`);
  const snapshot=normalized((await rpc(f.a,'data_quality_snapshot')).snapshot);
  const request={reporting:{householdId:h,asOf:'2026-10-01',month:'2026-10',currency:'ILS'},forecast:{householdId:h,start:'2026-10-01',evidenceAsOf:'2026-10-15',horizon:30,buffer:{amount:'10',currency:'ILS'},accounts:[{accountId:f.bank.account.id,choice:'INCLUDE'},{accountId:other.account.id,choice:'INCLUDE'}]}};
  const calculated=calculations(snapshot,request);
  eq(calculated.quality.externalCoverage,'UNKNOWN','external coverage remains unknown');
  eq(calculated.quality.findings.filter(x=>x.type==='CATEGORY_SCOPE' && x.subject.id===personal.transaction.id).length,0,'Task 14 ownership exclusion preserved');
  const inventory=await objects(state), tables=fingerprint(state);
  const users=[...f.users.map(u=>({id:u.id,email:u.email})),{id:partnerId,email:extraEmail}];
  // Keep replay credentials ONLY in the ACL-protected lab, never in source/review artifacts.
  const tokens=await Promise.all([f.a,f.b,partner].map(async c=>(await c.auth.getSession()).data.session.access_token));
  writeFileSync(join(lab,'fixture-private.json'),JSON.stringify({users,tokens,h,partnerId,aMember,bMember,revokedEmail,upload,request,snapshot,calculated,tables,inventory,checks,commit,result:committed.data.result}),{flag:'wx',mode:0o600});
  const report=backup(lab,inventory);
  return {checks,...report,tables:tables.length,objects:inventory.length};
}

export async function verify(sourceLab,targetLab) {
  const state=readState(targetLab); requireThat(state.phase==='VERIFYING','REFUSED_VERIFICATION_STATE');
  const before=JSON.parse(readFileSync(join(sourceLab,'fixture-private.json'),'utf8')),s=status(state),admin=client(s,true);
  let checks=0;
  const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
  eq(sql(state,'select count(*) from auth.sessions;'),'0','restored sessions invalidated before API release');
  eq(await objects(state),before.inventory,'all private bytes, lengths and SHA-256 match');
  eq(fingerprint(state),before.tables,'exact complete financial/private/migration table parity');
  const replay=createClient(s.API_URL,s.ANON_KEY,{db:{schema:'api'},global:{headers:{Authorization:`Bearer ${before.tokens[0]}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const replayResult=await replay.rpc('data_quality_snapshot');
  eq(Boolean(replayResult.error)||replayResult.data?.error?.code==='NOT_AUTHORIZED',true,'pre-backup JWT rejected');
  const a=client(s),b=client(s),partner=client(s),anon=client(s);
  await login(admin,a,before.users[0].email); await login(admin,b,before.users[1].email); await login(admin,partner,before.users[2].email);
  const revoked=client(s); await login(admin,revoked,before.revokedEmail);
  eq((await rpc(revoked,'data_quality_snapshot')).snapshot.obligations.reporting.households.length,0,'pre-backup revoked membership remains denied after fresh login');
  const snapshot=normalized((await rpc(a,'data_quality_snapshot')).snapshot);
  eq(snapshot,before.snapshot,'deep authorized graph parity (only capture time normalized)');
  eq(calculations(snapshot,before.request),before.calculated,'all canonical calculations, dates, FX, ownership and quality parity');
  eq((await rpc(partner,'data_quality_snapshot')).snapshot.obligations.reporting.households.map(h=>h.id),[before.h],'second member restored');
  eq((await rpc(b,'data_quality_snapshot')).snapshot.obligations.reporting.households.some(h=>h.id===before.h),false,'cross-household graph isolation');
  eq((await anon.rpc('data_quality_snapshot')).error!==null,true,'anonymous database denied');
  eq((await a.schema('private').from('transaction_receipts').select('*')).error!==null,true,'private receipts unexposed');
  eq((await a.storage.from('import-preview').download(before.upload.path)).error,null,'member private bytes readable');
  eq((await b.storage.from('import-preview').download(before.upload.path)).error!==null,true,'foreign private bytes denied');
  eq((await anon.storage.from('import-preview').download(before.upload.path)).error!==null,true,'anonymous private bytes denied');
  eq((await a.storage.from('import-preview').createSignedUrl(before.upload.path,60)).error!==null,true,'signed capability still denied');
  const retried=await a.functions.invoke('import-commit',{body:before.commit});
  eq(retried.error,null,'recovered Edge endpoint'); eq(retried.data.result,before.result,'durable exact receipt recovery');
  const oldToken=(await partner.auth.getSession()).data.session.access_token;
  sql(state,`update finance.household_members set status='REVOKED' where id='${before.bMember}';`);
  eq((await partner.auth.getSession()).data.session.access_token,oldToken,'revocation test keeps original JWT');
  eq((await rpc(partner,'data_quality_snapshot')).snapshot.obligations.reporting.households.length,0,'immediate membership revocation');
  eq((await partner.storage.from('import-preview').download(before.upload.path)).error!==null,true,'immediate Storage revocation');
  await login(admin,partner,before.users[2].email);
  eq((await rpc(partner,'data_quality_snapshot')).snapshot.obligations.reporting.households.length,0,'fresh authentication cannot bypass revoked membership');
  eq((await admin.auth.admin.deleteUser(before.partnerId)).error,null,'compromised synthetic identity removed');
  eq(sql(state,`select status||':'||(user_id is null)::text from finance.household_members where id='${before.bMember}';`),'REVOKED:true','durable attribution survives identity loss');
  const reinvite=await admin.auth.admin.generateLink({type:'invite',email:before.users[2].email});
  eq(reinvite.error,null,'authorized reinvitation creates new identity');
  eq(reinvite.data.user.id===before.partnerId,false,'new identity cannot reclaim old member');
  const recovered=client(s);eq((await recovered.auth.verifyOtp({type:'invite',token_hash:reinvite.data.properties.hashed_token})).error,null,'new invitation authentication');
  eq((await rpc(recovered,'data_quality_snapshot')).snapshot.obligations.reporting.households.length,0,'invitation alone has no membership');
  sql(state,`begin; insert into finance.profiles(id,display_name) values('${reinvite.data.user.id}','Synthetic recovered'); insert into finance.household_members(household_id,user_id,display_name) values('${before.h}','${reinvite.data.user.id}','Synthetic recovered'); commit;`);
  eq((await rpc(recovered,'data_quality_snapshot')).snapshot.obligations.reporting.households.map(h=>h.id),[before.h],'explicit new membership restores authorized access');
  const session=(await recovered.auth.getSession()).data.session, sid=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url')).session_id;
  sql(state,`delete from auth.sessions where id='${sid}';`);
  eq((await recovered.rpc('data_quality_snapshot')).data?.error?.code,'NOT_AUTHORIZED','deleted live session denied with unchanged JWT');
  eq((await recovered.storage.from('import-preview').download(before.upload.path)).error!==null,true,'deleted session private Storage denied');
  // Security recovery intentionally changes identities/audit only; retained financial evidence stays exact.
  const after=fingerprint(state), excluded=/^(finance\.(profiles|household_members)|private\.identity_audit)\|/;
  eq(after.filter(x=>!excluded.test(x)),before.tables.filter(x=>!excluded.test(x)),'user recovery preserves financial history and immutable ownership');
  state.phase='VERIFIED'; state.verifiedAt=new Date().toISOString(); state.assertions=checks;saveState(targetLab,state);
  return {checks,financialTables:before.tables.length,objects:before.inventory.length,calculationHash:sha256(JSON.stringify(before.calculated))};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  try {
    const [mode,source,target]=process.argv.slice(2);
    if(mode==='seed' && source && !target)console.log(JSON.stringify(await seed(source)));
    else if(mode==='verify' && source && target)console.log(JSON.stringify(await verify(source,target)));
    else throw new Error('INVALID_ARGUMENTS');
  } catch(error) {
    // Assertions may contain sessions/financial fixtures. Print only the label, never actual/expected.
    console.error(error.code==='ERR_ASSERTION' ? `ASSERTION_FAILED: ${error.message.split('\n')[0]}` : /^[A-Z_]+$/.test(error.message)?error.message:'DRILL_FAILED');
    process.exitCode=1;
  }
}
