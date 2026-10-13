import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { obligationFixture } from '../tests/integration/obligation-fixture.mjs';
import { localAdmin,localSql,uuid,sqlText } from './local-supabase.mjs';
const f=await obligationFixture();let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const save=c=>f.rpc(f.a,'obligation_command',c),read=(c=f.a)=>f.rpc(c,'obligations_snapshot'),h=uuid(f.households[0]);
const denied=async(c,code='INVALID_INPUT')=>eq((await save(c)).error?.code,code,'invalid/unauthorized payload');
try {
 const actual=await f.save(f.bank,'-10','EXPENSE'),partial=await f.save(f.bank,'-7','EXPENSE'),excess=await f.save(f.bank,'-12','EXPENSE');
 const historical=[];for(const date of ['2026-07-31','2026-08-31','2026-09-30'])historical.push(await f.save(f.bank,'-10','EXPENSE',null,{transactionDate:date,description:'מנוי סינתטי'}));
 const evidence=()=>localSql(`select json_build_array((select jsonb_agg(to_jsonb(t) order by revision_id) from finance.transaction_revisions t where household_id='${h}'),(select jsonb_agg(to_jsonb(t) order by revision_id,id) from finance.transaction_allocations t where household_id='${h}'),(select jsonb_agg(to_jsonb(t) order by id) from finance.budgets t where household_id='${h}'),(select count(*) from finance.balance_observations where household_id='${h}'),(select count(*) from finance.fx_evidence where household_id='${h}'),(select count(*) from finance.reconciliation_decisions where household_id='${h}'),(select count(*) from private.transaction_audit where household_id='${h}'));`);
 const before=evidence(),c=f.command({origin:historical.map(x=>f.evidence(x))});
 eq((await Promise.all([save(c),save(c),save(c)])).map(r=>r.version),[1,1,1],'identical concurrent confirmation');
 eq(localSql(`select count(*) from finance.obligation_revisions where id='${uuid(c.id)}';`),'1','one confirmation');
 await denied({...c,id:randomUUID(),idempotencyKey:randomUUID()},'CONFLICT');
 await denied({...c,plan:{...c.plan,money:{amount:'11',currency:'ILS'}}},'CONFLICT');
 for(const acknowledge of [false,null,'true'])await denied(f.command({acknowledge}));
 await denied(f.command({plan:{...c.plan,effect:null}}));
 for(const amount of ['-1','0','1.000000000','10000000000000000'])await denied(f.command({plan:{...c.plan,money:{amount,currency:'ILS'}}}));
 for(const day of [0,32,1.5,'31'])await denied(f.command({plan:{...c.plan,schedule:{frequency:'MONTHLY',day}}}));
 await denied(f.command({plan:{...c.plan,schedule:{frequency:'ANNUAL',day:1}}}));
 await denied(f.command({plan:{...c.plan,effect:'DEBT_PRINCIPAL'}}));
 const foreignMember=JSON.parse(localSql(`select json_agg(id) from finance.household_members where household_id='${uuid(f.households[1])}';`))[0];
 await denied(f.command({plan:{...c.plan,ownership:{kind:'MEMBER',memberId:foreignMember}}}));
 const other=await f.account('BANK','ILS',f.b,f.households[1]);await denied(f.command({plan:{...c.plan,accountId:other.account.id}}));
 const foreignActual=f.movement(other,'-10','EXPENSE');eq((await f.rpc(f.b,'record_transaction',foreignActual)).ok,true,'independent household actual');
 await denied(f.match(c,foreignActual,'2026-11-30',{evidence:f.evidence(foreignActual,other)}),'CONFLICT');
 eq((await f.rpc(f.b,'obligation_command',c)).error.code,'NOT_AUTHORIZED','forged household');
 eq((await f.anon.rpc('obligation_command',{payload:c})).error.code,'42501','anonymous command');eq((await f.anon.rpc('obligations_snapshot')).error.code,'42501','anonymous read');
 const link=f.match(c,actual),parallel=await Promise.all([save(link),save(link)]);eq(parallel.map(r=>r.version),[1,1],'identical parallel match');
 const contradictory=f.match(c,actual,'2026-11-30');eq((await save(contradictory)).error.code,'CONFLICT','transaction consumed by one occurrence');
 await denied(f.match(c,partial),'CONFLICT');
 await denied(f.match(c,partial,'2026-10-30'));
 await denied(f.match(c,partial,'2026-11-30',{evidence:{...f.evidence(partial),allocationId:randomUUID()}}),'CONFLICT');
 await denied(f.match(c,partial,'2026-11-30',{evidence:{...f.evidence(partial),transactionVersion:99}}),'CONFLICT');
 await denied(f.match(c,partial,'2026-11-30',{evidence:{...f.evidence(partial),accountVersion:99}}),'CONFLICT');
 for(const [row,state,date] of [[partial,'PARTIAL','2026-11-30'],[excess,'AMBIGUOUS','2026-12-31']]){const m=f.match(c,row,date);eq((await save(m)).ok,true,'explicit non-exact link');eq((await read()).snapshot.payments.find(p=>p.id===m.id).state,state,'non-exact evidence is not completed');}
 const unlink={...link,action:'UNLINK',expectedVersion:1,idempotencyKey:randomUUID(),evidence:null};eq((await save(unlink)).version,2,'unlink retains history');eq((await save({...link,expectedVersion:2,idempotencyKey:randomUUID()})).version,3,'explicit relink same occurrence');
 const current=(await read()).snapshot;eq(current.payments.filter(p=>p.id===link.id).map(p=>p.action),['LINK','UNLINK','LINK'],'immutable link decisions');
 eq((await read(f.b)).snapshot.revisions.length,0,'household isolation');eq(current.size,current.revisions.length+current.payments.length+current.rejections.length,'coherent bound count');
 const change={...c,action:'EDIT',expectedVersion:1,effectiveFrom:'2026-10-01',idempotencyKey:randomUUID(),plan:{...c.plan,money:{amount:'20',currency:'ILS'}}};await denied(change,'CONFLICT');
 const later={...change,effectiveFrom:'2027-01-01'},concurrent=await Promise.all([save(later),save({...later,idempotencyKey:randomUUID(),plan:{...c.plan,money:{amount:'21',currency:'ILS'}}})]);eq(concurrent.filter(r=>r.ok).length,1,'one expected-version edit');eq(concurrent.filter(r=>r.error?.code==='CONFLICT').length,1,'concurrent loser conflicts');
 eq((await save(c)).version,1,'old receipt remains initial');
 const head=(await read()).snapshot.revisions.find(v=>v.id===c.id&&v.version===2);
 await denied({...later,expectedVersion:2,idempotencyKey:randomUUID(),effectiveFrom:'2026-12-01'});
 await denied({...later,expectedVersion:2,idempotencyKey:randomUUID(),effectiveFrom:'2027-02-01',origin:[]});
 const archive={...c,action:'ARCHIVE',expectedVersion:2,idempotencyKey:randomUUID(),effectiveFrom:'2027-02-01',plan:head.plan};eq((await save(archive)).version,3,'archive retains prior windows');eq((await save({...archive,action:'EDIT',expectedVersion:3,idempotencyKey:randomUUID()})).error.code,'CONFLICT','archive terminal');
 const reject={householdId:h,id:randomUUID(),action:'REJECT',expectedVersion:0,idempotencyKey:randomUUID(),acknowledge:true,evidence:historical.map(x=>f.evidence(x))};eq((await save(reject)).version,1,'explicit rejection');eq((await save(reject)).version,1,'rejection retry');
 eq(evidence(),before,'all planning/link/reject/edit/archive leave financial and budget evidence unchanged');
 // Current revision validation, including corrected and voided payments.
 const correction={...actual,revisionId:randomUUID(),supersedesRevisionId:actual.revisionId,expectedVersion:1,idempotencyKey:randomUUID(),reason:'Synthetic correction',transaction:{...actual.transaction,money:{amount:'-9',currency:'ILS'},allocations:actual.transaction.allocations.map(a=>({...a,money:{amount:'-9',currency:'ILS'}}))}};
 eq((await f.rpc(f.a,'record_transaction',correction)).ok,true,'separate authorized financial correction');
 const manual=f.command();eq((await save(manual)).ok,true,'manual confirmation without hypothesis');
 const raceActual=await f.save(f.bank,'-10','EXPENSE'),racePlan=f.command();eq((await save(racePlan)).ok,true,'independent plan for conflicting actual claims');
 const race=await Promise.all([save(f.match(manual,raceActual)),save(f.match(racePlan,raceActual))]);eq(race.filter(r=>r.ok).length,1,'one concurrent actual claim wins');eq(race.filter(r=>r.error?.code==='CONFLICT').length,1,'contradictory concurrent match conflicts');
 await denied(f.match(manual,actual),'CONFLICT');
 const voided=await f.save(f.bank,'-10','EXPENSE',null,{status:'VOIDED'});await denied(f.match(manual,voided),'CONFLICT');
 const pending=await f.save(f.bank,'-10','EXPENSE',null,{status:'PENDING'});await denied(f.match(manual,pending),'CONFLICT');
 const refund=await f.save(f.bank,'10','EXPENSE');await denied(f.match(manual,refund),'CONFLICT');
 const transfer=await f.save(f.bank,'-10','TRANSFER');await denied(f.match(manual,transfer),'CONFLICT');
 const card=await f.account('CREDIT_CARD'),settlement=await f.save(f.bank,'-10','EXPENSE'),purchase=await f.save(card,'-10','EXPENSE');
 eq((await f.rpc(f.a,'reconcile',f.link([f.participant(settlement,f.bank,'PAYMENT','CARD'),f.participant(purchase,card,'PURCHASE','CARD')],'CARD'))).ok,true,'retained card reconciliation');await denied(f.match(manual,settlement),'CONFLICT');
 const splitParts=[{id:randomUUID(),effect:'DEBT_PRINCIPAL',money:{amount:'-90',currency:'ILS'},ownership:{kind:'HOUSEHOLD'},categorization:{origin:'USER',userLocked:true}},{id:randomUUID(),effect:'EXPENSE',money:{amount:'-10',currency:'ILS'},ownership:{kind:'HOUSEHOLD'},categorization:{origin:'USER',userLocked:true}}];
 const split=await f.save(f.bank,'-100','DEBT_PRINCIPAL',splitParts);eq((await save(f.match(manual,split,'2026-11-30'))).ok,true,'interest allocation linked distinctly from principal');
 const rollbackPlan=f.command(),rollbackActual=await f.save(f.bank,'-10','EXPENSE');eq((await save(rollbackPlan)).ok,true,'rollback-link plan');
 // Inject a late failure and prove the entire command transaction rolls back.
 localSql(`create function private.obligation_test_failure() returns trigger language plpgsql as $$begin if new.household_id='${h}' then raise exception 'synthetic late failure'; end if; return new; end$$; create trigger obligation_test_failure before insert on private.obligation_audit for each row execute function private.obligation_test_failure();`);
 const late=f.command(),lateLink=f.match(rollbackPlan,rollbackActual);try{eq((await save(late)).error.code,'INTERNAL_ERROR','fixed late error');eq(localSql(`select count(*) from finance.obligations where id='${uuid(late.id)}';`),'0','rollback head');eq(localSql(`select count(*) from private.obligation_receipts where household_id='${h}' and idempotency_key=${sqlText(late.idempotencyKey)};`),'0','rollback receipt');eq((await save(lateLink)).error.code,'INTERNAL_ERROR','late link error');eq(localSql(`select count(*) from finance.obligation_payment_claims where transaction_id='${uuid(rollbackActual.transaction.id)}';`),'0','claim rollback');eq(localSql(`select count(*) from finance.obligation_payment_heads where id='${uuid(lateLink.id)}';`),'0','link head rollback');eq(localSql(`select count(*) from finance.obligation_payment_decisions where id='${uuid(lateLink.id)}';`),'0','link decision rollback');}finally{localSql('drop trigger obligation_test_failure on private.obligation_audit; drop function private.obligation_test_failure();');}
 eq((await save(late)).ok,true,'same exact retry after rollback');
 eq((await save(lateLink)).ok,true,'same exact link retry after rollback');
 const cancelled=f.command();eq((await save(cancelled)).ok,true,'manual plan to cancel');
 eq((await save({...cancelled,action:'CANCEL',expectedVersion:1,effectiveFrom:'2026-11-01',idempotencyKey:randomUUID()})).version,2,'explicit cancellation');
 eq((await read()).snapshot.revisions.find(v=>v.id===cancelled.id&&v.version===2).status,'CANCELLED','cancellation durable');
 // The invoker command calendar guard must agree with pure recurrence across session timezones.
 const calendarActual=await f.save(f.bank,'-10','EXPENSE'),calendarPlan=f.command({plan:{...c.plan,startDate:'2024-01-01'},effectiveFrom:'2024-01-01'});
 eq((await save(calendarPlan)).ok,true,'calendar fixture confirmation');
 const {data:{session:calendarSession}}=await f.a.auth.getSession(),claims=JSON.parse(Buffer.from(calendarSession.access_token.split('.')[1],'base64url').toString());
 for(const zone of ['UTC','Asia/Jerusalem','America/Los_Angeles','Pacific/Kiritimati'])for(const date of ['2024-02-29','2025-02-28']){
  const cmd=f.match(calendarPlan,calendarActual,date),jwt={sub:claims.sub,role:'authenticated',session_id:claims.session_id};
  const response=localSql(`begin; set local role authenticated; set local time zone ${sqlText(zone)}; select set_config('request.jwt.claims',${sqlText(JSON.stringify(jwt))},true); select api.obligation_command(${sqlText(JSON.stringify(cmd))}::jsonb)->>'version'; rollback;`);
  eq(response.split(/\r?\n/).includes('1'),true,`monthly 31 clamps in ${zone} on ${date}`);
 }
 localSql(`update finance.household_members set status='REVOKED' where household_id='${h}';`);eq((await save(c)).error.code,'NOT_AUTHORIZED','revoked unchanged JWT replay denied');
 const revoked=(await read()).snapshot;eq(revoked.revisions.length+revoked.payments.length+revoked.rejections.length,0,'protected history cleared');
 const {data:{session}}=await f.a.auth.getSession(),sid=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString()).session_id;
 localSql(`delete from auth.sessions where id='${uuid(sid)}';`);eq((await read()).error.code,'NOT_AUTHORIZED','deleted session read');eq((await save(c)).error.code,'NOT_AUTHORIZED','deleted session replay');
 await localAdmin().auth.admin.deleteUser(f.users[0].id);eq((await save(c)).error.code,'NOT_AUTHORIZED','deleted user replay');eq(localSql(`select count(*)>0 from finance.obligation_revisions where household_id='${h}';`),'t','durable deleted author history');
 console.log(`Obligations API: ${checks} assertions passed.`);
}finally{await f.cleanup();}
