import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createFixture } from '../tests/integration/local-fixtures.mjs';
import { cleanupImports } from './cleanup-imports.mjs';
import { localStatus,localSql,localAdmin,sqlText,uuid } from './local-supabase.mjs';
const status=localStatus(),fixture=await createFixture();
const client=()=>createClient(status.API_URL,status.ANON_KEY,{db:{schema:'api'},auth:{persistSession:false,autoRefreshToken:false}});
const a=client(),b=client(),anon=client();let checks=0;
const eq=(x,y,label)=>{assert.deepEqual(x,y,label);checks++;};
const h=uuid(fixture.households[0]),aid=randomUUID(),sid=randomUUID();
const mapping={date:0,description:1,amount:2,debit:null,credit:null,currency:null,reference:3,supplementary:null,dateFormat:'YYYY-MM-DD',decimal:'.',grouping:'NONE',sign:'POSITIVE_INCREASES',fixedCurrency:'ILS'};
const format={encoding:'UTF-8',delimiter:','};
const csv='date,description,amount,ref\n2026-10-02,Synthetic repeat,-10.20,ref-1\n2026-10-02,Synthetic repeat,-10.20,ref-2\n2026-10-03,Synthetic positive,5,ref-3\n2026-02-31,invalid,1,bad\n,,,missing';
async function rpc(c,name,payload){const r=await c.rpc(name,{payload});assert.equal(r.error,null,'RPC transport');return r.data;}
async function upload(content=csv){
 const bytes=new TextEncoder().encode(content),id=randomUUID();
 const auth=await rpc(a,'import_command',{action:'AUTHORIZE',id,householdId:h,accountId:aid,sourceId:sid,filename:'synthetic.csv',bytes:bytes.length});eq(auth.ok,true,'authorize file');
 eq((await a.storage.from('import-preview').upload(auth.upload.path,bytes,{contentType:'text/csv',upsert:false})).error,null,'immutable private bytes');return auth.upload;
}
async function edge(c,body){const r=await c.functions.invoke('import-commit',{body});if(r.error)throw new Error('Edge transport '+r.error.context?.status);return r.data;}
const review=(u,c=a,m=mapping)=>edge(c,{action:'REVIEW',id:u.id,format,mapping:m});
const decide=(r,selected=[2,3,4])=>({action:'COMMIT',reviewId:r.id,idempotencyKey:randomUUID(),decisions:r.preview.rows.map(row=>({row:row.row,include:selected.includes(row.row),effect:'UNCLASSIFIED',status:'POSTED',acknowledge:true}))});
const count=()=>localSql(`select count(*) from finance.transactions where household_id='${h}'`);
const retained=()=>localSql(`select jsonb_build_array((select jsonb_agg(to_jsonb(x)) from finance.balance_observations x where household_id='${h}'),(select jsonb_agg(to_jsonb(x)) from finance.fx_evidence x where household_id='${h}'),(select jsonb_agg(to_jsonb(x)) from finance.accounts x where household_id='${h}'))`);
try{
 for(const [c,u] of [[a,fixture.users[0]],[b,fixture.users[1]]])eq((await c.auth.verifyOtp({token_hash:u.hash,type:'invite'})).error,null,'live session');
 eq((await rpc(a,'create_account',{account:{id:aid,householdId:h,name:'Synthetic import',ownership:{kind:'HOUSEHOLD'},type:'CASH',currency:'ILS',valuationCurrency:'ILS',balancePolicy:'LEDGER',status:'ACTIVE'},manualSourceId:sid,version:1})).ok,true,'account');
 const before=retained();
 eq((await anon.rpc('begin_import',{payload:{action:'REVIEW',id:randomUUID()}})).error!==null,true,'anonymous command denied');
 eq((await a.rpc('finish_import',{payload:{}})).error!==null,true,'browser cannot send parsed financial rows');
 eq((await b.rpc('finish_import',{payload:{}})).error!==null,true,'other household privileged RPC denied');
 eq((await anon.rpc('import_evidence')).error!==null,true,'anonymous receipts denied');
 const u=await upload();
 eq((await review(u,b)).error.code,'NOT_AUTHORIZED','cross household upload');
 eq((await review({id:randomUUID()})).error.code,'NOT_AUTHORIZED','forged upload');
 let r=(await review(u)).review;assert.ok(r,'server-authoritative review');checks++;
 eq(r.preview.invalid,1,'invalid count');eq(r.preview.unresolved,1,'unresolved count');eq(count(),'0','review has no financial writes');
 eq(r.duplicates.find(d=>d.row===2).reasons.includes('REPEATED_IN_FILE'),true,'legitimate repeated values need review');
 eq(localSql(`select kind||':'||coalesce(authoritative_from::text,'NULL') from finance.account_sources where id='${uuid(r.sourceId)}'`),'FILE_IMPORT:NULL','distinct non-authoritative source');
 eq(r.sourceId!==sid,true,'manual provenance not relabelled');eq(retained(),before,'observations/account untouched');
 const bad=decide(r,[5]);eq((await edge(a,bad)).error.code,'INVALID_INPUT','invalid row cannot persist');eq(count(),'0','invalid rollback');
 const unresolved=decide(r,[6]);eq((await edge(a,unresolved)).error.code,'INVALID_INPUT','unresolved row cannot persist');
 const unreviewed=decide(r,[2]);unreviewed.decisions=unreviewed.decisions.map(d=>({...d,acknowledge:false}));eq((await edge(a,unreviewed)).error.code,'INVALID_INPUT','ambiguous decision requires acknowledgement');
 const foreign=decide(r);eq((await edge(b,foreign)).error.code,'NOT_AUTHORIZED','foreign review/receipt denied');
 const forged={...decide(r),rows:[{amount:'1000'}]};eq((await edge(a,forged)).error.code,'INVALID_INPUT','browser row payload rejected');
 eq((await edge(a,{...decide(r),mapping:{...mapping,sign:'POSITIVE_DECREASES'}})).error.code,'INVALID_INPUT','modified commit mapping rejected');
 eq((await edge(a,{action:'REVIEW',id:u.id,format,mapping,adapter:'generic-csv-v2'})).error.code,'INVALID_INPUT','browser parser version cannot change interpretation');
 const mixed=await upload('date,description,amount,ref,currency\n2026-10-02,foreign,1,mixed,USD\n2026-10-02,local,1,local,ILS');const mixedReview=(await review(mixed,a,{...mapping,currency:4,fixedCurrency:null})).review;
 eq(mixedReview.preview.invalid,1,'server rejects foreign currency');eq((await edge(a,decide(mixedReview,[2]))).error.code,'INVALID_INPUT','mixed currency selected row cannot commit');
 const cmd=decide(r);const parallel=await Promise.all(Array.from({length:5},()=>edge(a,cmd)));
 eq(parallel.every(x=>x.ok),true,'concurrent identical command results');eq(parallel.every(x=>JSON.stringify(x.result)===JSON.stringify(parallel[0].result)),true,'identical durable receipts');
 const result=parallel[0].result;eq(result.committed,3,'committed count');eq(result.skipped,0,'skipped count');eq(result.invalid,1,'invalid excluded count');eq(result.unresolved,1,'unresolved excluded count');eq(count(),'3','no concurrent duplicates');
 eq(localSql(`select count(*) from finance.import_rows where household_id='${h}'`),'3','one provenance record each');
 eq(localSql(`select count(*) from finance.transaction_allocations where household_id='${h}' and payload->>'effect'='UNCLASSIFIED' and payload->'categorization'='{"origin":"UNCLASSIFIED","userLocked":false}'`),'3','sign never assigns effect or category');
 eq(localSql(`select string_agg(amount::text,',' order by transaction_id) from finance.transaction_revisions where household_id='${h}'`).split(',').sort(),['-10.20000000','-10.20000000','5.00000000'],'exact signed Money');
 eq(retained(),before,'authority/accounts/observations untouched after commit');
 eq((await edge(a,{...cmd,decisions:cmd.decisions.map(d=>({...d,effect:'EXPENSE'}))})).error.code,'CONFLICT','key changed complete decisions');
 eq((await edge(a,{...cmd,idempotencyKey:randomUUID()})).error.code,'CONFLICT','review cannot commit a second command');
 eq((await edge(a,cmd)).result,result,'lost response exact retry');
 r=(await review(u)).review;eq(r.duplicates.filter(d=>d.exact).length,3,'exact prior source rows distinguished');eq((await edge(a,decide(r,[2]))).error.code,'INVALID_INPUT','exact import cannot be accepted');
 const changedInterpretation=(await review(u,a,{...mapping,sign:'POSITIVE_DECREASES'})).review;eq(changedInterpretation.duplicates.find(d=>d.row===2).reasons.includes('INTERPRETATION_CHANGED'),true,'same file row different mapping cannot evade identity');
 const same=await upload(csv+'\n2026-10-04,Distinct,1,ref-4');let different=(await review(same)).review;
 eq(different.duplicates.find(d=>d.row===2).exact,false,'different file is candidate not exact');eq(different.duplicates.find(d=>d.row===2).reasons.includes('SAME_FINANCIAL_VALUES'),true,'cross-file financial candidate');eq(different.duplicates.find(d=>d.row===2).reasons.includes('SAME_REFERENCE'),true,'source reference evidence');
 const manualTx=randomUUID(),manualRev=randomUUID(),manualAllocation=randomUUID();
 const manual={transaction:{id:manualTx,householdId:h,accountId:aid,transactionDate:'2026-10-04',money:{amount:'1',currency:'ILS'},description:'Distinct',status:'POSTED',provenance:[{source:{sourceId:sid,kind:'MANUAL'}}],allocations:[{id:manualAllocation,effect:'EXPENSE',money:{amount:'1',currency:'ILS'},ownership:{kind:'HOUSEHOLD'},categorization:{origin:'UNCLASSIFIED',userLocked:false}}]},revisionId:manualRev,supersedesRevisionId:null,expectedVersion:0,idempotencyKey:randomUUID(),entryKind:'MOVEMENT',openingCoverage:null,reason:''};
 eq((await rpc(a,'record_transaction',manual)).ok,true,'existing writer manual fixture');eq((await edge(a,decide(different,[7]))).error.code,'CONFLICT','history change invalidates stale review');
 const categoryId=randomUUID();const category=await rpc(a,'save_categorization_definition',{kind:'CATEGORY',idempotencyKey:randomUUID(),record:{id:categoryId,householdId:h,version:1,name:'Synthetic retained lock',kind:'EXPENSE',status:'ACTIVE'}});eq(category.ok,true,'retained category fixture');
 eq((await rpc(a,'categorize_transaction',{householdId:h,accountId:aid,transactionId:manualTx,allocationId:manualAllocation,revisionId:randomUUID(),supersedesRevisionId:manualRev,expectedVersion:1,idempotencyKey:randomUUID(),generation:category.generation,action:'ASSIGN',categoryId,ruleId:null})).ok,true,'retained USER lock fixture');
 const manualHistory=()=>localSql(`select jsonb_build_array((select jsonb_agg(to_jsonb(r) order by revision_id) from finance.transaction_revisions r where transaction_id='${manualTx}'),(select jsonb_agg(to_jsonb(ta) order by ta.revision_id,ta.id) from finance.transaction_allocations ta join finance.transaction_revisions tr on tr.revision_id=ta.revision_id where tr.transaction_id='${manualTx}'))`);
 const lockedHistory=manualHistory();eq(localSql(`select payload->'categorization' from finance.transaction_allocations ta join finance.transaction_revisions tr on tr.revision_id=ta.revision_id where tr.transaction_id='${manualTx}' and tr.version=2`),'{"origin": "USER", "userLocked": true}','explicit historical category lock');
 different=(await review(same)).review;eq(different.duplicates.find(d=>d.row===7).candidates.includes(manualTx),true,'manual duplicate candidate');
 const cmd1=decide(different,[7]),cmd2=decide(different,[4]);const conflict=await Promise.all([edge(a,cmd1),edge(a,cmd2)]);eq(conflict.filter(x=>x.ok).length,1,'incompatible concurrent commits cannot both succeed');
 eq(manualHistory(),lockedHistory,'import preserves existing immutable history and USER category lock');
 const batchCsv='date,description,amount,ref\n'+Array.from({length:101},(_,i)=>`2026-10-05,Unique ${i},${i+1},batch${i}`).join('\n');const batch=await upload(batchCsv),batchReview=(await review(batch)).review;
 eq((await edge(a,decide(batchReview,batchReview.preview.rows.map(row=>row.row)))).error.code,'INVALID_INPUT','bounded atomic batch');
 // A late failure must roll back transactions, rows and receipts together.
 localSql(`create function private.synthetic_import_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic'; end$$; create trigger synthetic_import_failure before insert on finance.import_rows for each row execute function private.synthetic_import_failure();`);
 const rollbackCount=count(),rollbackCmd=decide(batchReview,[2]);
 try{eq((await edge(a,rollbackCmd)).ok,false,'late injected persistence failure');eq(count(),rollbackCount,'complete rollback');eq(localSql(`select count(*) from private.import_receipts where idempotency_key=${sqlText(rollbackCmd.idempotencyKey)}`),'0','failure has no receipt');}
 finally{localSql('drop trigger synthetic_import_failure on finance.import_rows; drop function private.synthetic_import_failure();');}
 eq((await edge(a,rollbackCmd)).ok,true,'same command recoverable after rollback');
 // Lease and cleanup protocol: cancellation loses to active lease, then wins after release.
 const leased=await upload('date,description,amount,ref\n2026-10-06,lease,2,lease');const lease=await rpc(a,'begin_import',{action:'REVIEW',id:leased.id});eq(lease.ok,true,'bounded lease');
 eq((await rpc(a,'import_command',{action:'CANCEL',id:leased.id})).error.code,'CONFLICT','cancel cannot race active parser');
 localSql(`update finance.import_uploads set expires_at=now()-interval '1 minute' where id='${uuid(leased.id)}'`);
 eq((await a.storage.from('import-preview').download(leased.path)).error,null,'existing lease may finish across expiration');
 eq((await rpc(a,'begin_import',{action:'REVIEW',id:leased.id})).error.code,'CONFLICT','expired cannot acquire new lease');
 const reserved=JSON.parse(localSql('select private.reserve_import_cleanup()'));eq(reserved.some(x=>x.id===leased.id),false,'cleanup excludes evidence with active lease');
 await rpc(a,'release_import',{id:lease.leaseId});eq((await review(leased)).error.code,'CONFLICT','expired upload cannot review');await cleanupImports();eq((await a.storage.from('import-preview').download(leased.path)).error!==null,true,'expired raw removed after lease');
 await rpc(a,'import_command',{action:'CANCEL',id:u.id});eq((await review(u)).error.code,'CONFLICT','cancelled upload blocks new review');await cleanupImports();eq((await edge(a,cmd)).result,result,'receipt recovery after raw and metadata deletion');eq((await b.rpc('import_evidence')).data,[],'durable evidence household isolation');
 const revoke=await upload('date,description,amount,ref\n2026-10-07,revoke,1,revoke');const revokeReview=(await review(revoke)).review;
 localSql(`update finance.household_members set status='REVOKED' where household_id='${h}'`);eq((await edge(a,decide(revokeReview))).error.code,'NOT_AUTHORIZED','unchanged JWT revoked member');eq((await edge(a,cmd)).error.code,'NOT_AUTHORIZED','revoked cannot recover receipts');eq((await a.rpc('import_evidence')).data,[],'revoked evidence denied');
 localSql(`update finance.household_members set status='ACTIVE' where household_id='${h}'`);
 // Archived account rejects new work but previously committed receipt remains recoverable.
 localSql(`update finance.accounts set status='ARCHIVED',version=version+1 where id='${aid}'`);eq((await review(revoke)).error.code,'CONFLICT','archived account');eq((await edge(a,cmd)).result,result,'authorized archived receipt recovery');
 localSql(`delete from auth.sessions where user_id='${uuid(fixture.users[0].id)}'`);eq((await edge(a,cmd)).error.code,'NOT_AUTHORIZED','deleted session cannot recover');
 const jobCount=localSql(`select count(*) from finance.import_jobs where household_id='${h}' and result is not null`);
 eq((await localAdmin().auth.admin.deleteUser(fixture.users[0].id)).error,null,'delete originating Auth user');eq((await edge(a,cmd)).error.code,'NOT_AUTHORIZED','deleted Auth user cannot recover');
 eq(localSql(`select count(*) from finance.import_jobs where household_id='${h}' and result is not null`),jobCount,'retained import provenance after Auth deletion');
 eq(localSql(`select count(*) from finance.household_members where household_id='${h}' and user_id is null and status='REVOKED'`),'1','durable originating member retained');
 console.log(`Import commit Auth/API/Storage integration: ${checks} assertions passed.`);
}finally{await fixture.cleanup();}
