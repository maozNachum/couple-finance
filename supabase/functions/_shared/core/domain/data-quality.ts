import { dataQualitySnapshotSchema, dataQualityRequestSchema } from '../contracts/data-quality.ts';
import type { DataQualitySnapshot, DataQualityRequest, DataQualityResult, QualityFinding, QualityEvidence, QualityImpact, QualityModule, QualityAction, QualityType } from '../contracts/data-quality.ts';
import type { Coverage } from '../contracts/reporting.ts';
import { obligationContext, expectedObligations } from './obligations.ts';
import { currentBudgets, budgetReport } from './budgets.ts';
import { householdReport } from './reporting.ts';
import { householdForecast } from './forecast.ts';
import { valueAccount } from './money/valuation.ts';
import { ledgerBalance, timestampOrder } from './money/ledger.ts';
import { financialDateSchema } from '../contracts/financial-date.ts';
import { lastDayOfMonth } from './dates/financial-date.ts';
import { daysInMonth } from './dates/calendar.ts';

const order = (a:string,b:string) => a < b ? -1 : a > b ? 1 : 0;
const unique = <T>(rows:readonly T[]):T[] => [...new Map(rows.map(r => [JSON.stringify(r),r])).entries()].sort((a,b)=>order(a[0],b[0])).map(([,r])=>r);
const balanceReasons = new Set(['NO_OPENING','BEFORE_OPENING','PARTIAL_OPENING','MISSING_OBSERVATION','PARTIAL_OBSERVATION','CARRIED_OBSERVATION','INCOMPLETE_LEDGER_PERIOD']);
const explanations:Readonly<Record<QualityType,string>> = {
  BALANCE_EVIDENCE:'ראיות היתרה חסרות או חלקיות, או שהמדידה מתייחסת לתאריך אחר. תצפית מתוארכת אינה מעידה על תקלה במקור או על שווי שגוי.',
  HISTORICAL_FX:'ראיית ההמרה הדרושה חסרה או אינה חד־משמעית בכיוון ובתאריך הנדרשים. הסכומים במטבע המקורי נשמרים; אין שימוש בשער של היום.',
  UNCLASSIFIED_EFFECT:'משמעותה הפיננסית של תנועה רשומה אינה מסווגת. בחירת קטגוריה לבדה אינה קובעת אם זו הכנסה, הוצאה או העברה.',
  RECONCILIATION_EVIDENCE:'התאמה קיימת דורשת בדיקה בעקבות שינוי בראיות, התאמה חלקית או משמעות פיננסית לא תואמת. אין כאן קביעה שכל תנועה לא משויכת היא שגיאה.',
  CATEGORY_SCOPE:'קיימת הוצאה מוכרת ללא קטגוריה שעשויה להשתייך לתקציב לפי קטגוריה. משמעות ההוצאה כבר ידועה; חסר שיוך קטגוריה בלבד.',
  PAYMENT_EVIDENCE:'ראיית התשלום של התחייבות דורשת בירור. היעדר שיוך אינו מוכיח שלא שולם ואינו מוכיח חוב בפיגור.',
  CALCULATION_LIMITATION:'החישוב הקיים מציין מגבלה או אי־ודאות. נדרשת בדיקת הראיות והבחירות במסך הרלוונטי לפני הסתמכות על התוצאה.',
};

/** Exact date-only age, including Gregorian century rules; no ambient time. */
export function observationAge(measured:string,asOf:string):number {
  const ordinal=(raw:string) => {
    const d=financialDateSchema.parse(raw),y=Number(d.slice(0,4)),m=Number(d.slice(5,7)),previous=y-1;
    let n=365*previous+Math.floor(previous/4)-Math.floor(previous/100)+Math.floor(previous/400)+Number(d.slice(8));
    for(let i=1;i<m;i++) n+=daysInMonth(y,i);
    return n;
  };
  const age=ordinal(asOf)-ordinal(measured);
  if(age<0)throw new RangeError('Future observation');
  return age;
}

/** Byte bound matches the server's combined snapshot cap; no browser-only TextEncoder. */
export function dataQualityContext(raw:DataQualitySnapshot) {
  const serialized=JSON.stringify(raw);
  let bytes=0;
  for(const char of serialized) {const code=char.codePointAt(0)!;bytes+=code<128?1:code<2048?2:code<65536?3:4;if(bytes>16777216)throw new RangeError('Quality snapshot bound');}
  const snapshot=dataQualitySnapshotSchema.parse(raw),context=obligationContext(snapshot.obligations);
  const budgetSnapshot={reporting:context.snapshot.reporting,categories:snapshot.categories,revisions:snapshot.budgets,size:snapshot.size};
  const budgets=currentBudgets(budgetSnapshot);
  const histories=new Map<string,typeof context.snapshot.reporting.decisions[number][]>();
  for(const d of context.snapshot.reporting.decisions) {
    const rows=histories.get(d.id)??[];rows.push(d);histories.set(d.id,rows);
    if(new Set(d.participants.map(p=>p.selection.transactionId)).size!==d.participants.length)throw new RangeError('Duplicate reconciliation participant');
    for(const p of d.participants) {
      const a=context.snapshot.reporting.accounts.find(a=>a.account.id===p.selection.accountId);
      if(!a || a.version<p.selection.accountVersion || p.selection.expectedVersion!==p.revision.version ||
        p.selection.parts.some(part=>!p.revision.transaction.allocations.some(a=>a.id===part.allocationId)))throw new RangeError('Reconciliation evidence context');
    }
  }
  const claims=new Set<string>();
  for(const rows of histories.values()) {
    rows.sort((a,b)=>a.version-b.version);
    for(let i=0;i<rows.length;i++) {
      const d=rows[i]!,prior=rows[i-1];
      if(d.version!==i+1 || d.householdId!==rows[0]!.householdId || d.kind!==rows[0]!.kind ||
        i===0 && d.action!=='LINK' || prior && (d.action==='LINK'||prior.action==='UNLINK'||timestampOrder(d.recordedAt)<timestampOrder(prior.recordedAt)) ||
        (d.action==='UNLINK')!==(d.participants.length===0))throw new RangeError('Incomplete reconciliation history');
    }
    const head=rows[rows.length-1]!;
    if(head.action!=='UNLINK')for(const p of head.participants){const key=`${head.householdId}/${p.selection.transactionId}`;if(claims.has(key))throw new RangeError('Duplicate reconciliation claim');claims.add(key);}
  }
  // Validate observation lineage for every visible account, including unselected households.
  for(const account of context.snapshot.reporting.accounts) if(account.account.balancePolicy==='OBSERVED')
    valueAccount(account,context.snapshot.reporting.observations,financialDateSchema.parse('9999-12-31'));
  return {snapshot,context,budgetSnapshot,budgets};
}

/** Only canonical calculators decide financial completeness. This layer groups their evidence. */
export function financialDataQuality(raw:DataQualitySnapshot,rawRequest:DataQualityRequest):DataQualityResult {
  const {snapshot:s,context,budgetSnapshot,budgets}=dataQualityContext(raw),request=dataQualityRequestSchema.parse(rawRequest),q=request.reporting;
  const r=s.obligations.reporting,report=householdReport(r,q),h=q.householdId;
  const selectedBudgets=budgets.filter(b=>b.householdId===h && b.month===q.month && b.status==='ACTIVE');
  const budget=budgetReport(budgetSnapshot,{...q,currency:selectedBudgets[0]?.planned.currency??q.currency});
  const expected=expectedObligations(s.obligations,h,`${q.month}-01`,lastDayOfMonth(q.month));
  const forecast=request.forecast ? householdForecast(s.obligations,request.forecast) : null;
  const forecastExpected=request.forecast && forecast?.days.length ? expectedObligations(s.obligations,h,request.forecast.start,forecast.days.at(-1)!.date):[];
  const roots=new Map<string,QualityFinding>();
  const accountEvidence=(id:string):QualityEvidence[] => {
    const a=r.accounts.find(a=>a.account.id===id && a.account.householdId===h);
    return a?[{kind:'ACCOUNT',id,version:a.version,sourceId:null,measuredOn:null,recordedAt:null,currency:a.account.currency},
      ...a.sources.map(source=>({kind:'SOURCE' as const,id:source.id,version:null,sourceId:source.id,measuredOn:null,authorityFrom:source.authoritativeFrom,recordedAt:null,currency:a.account.currency}))]:[];
  };
  const revisionEvidence=(id:string,revisionId?:string):QualityEvidence[] => {
    const v=(revisionId?r.history:context.current).find(v=>v.transaction.id===id && v.transaction.householdId===h && (!revisionId||v.revisionId===revisionId));
    return v?[{kind:'REVISION',id:v.revisionId,version:v.version,sourceId:v.transaction.provenance[0]?.source.sourceId??null,measuredOn:v.transaction.transactionDate,recordedAt:v.recordedAt,currency:v.transaction.money.currency}]:[];
  };
  const balanceEvidence=(id:string) => {
    const a=r.accounts.find(a=>a.account.id===id)!;
    if(a.account.balancePolicy==='OBSERVED') {
      const value=valueAccount(a,r.observations,q.asOf);
      if('observation' in value) {const o=value.observation;return [...accountEvidence(id),{kind:'OBSERVATION' as const,id:o.id,version:null,sourceId:o.sourceId,measuredOn:o.date,recordedAt:o.recordedAt,currency:o.money.currency}];}
    }
    return [...accountEvidence(id),...context.current.filter(v=>v.transaction.accountId===id && v.entryKind==='OPENING').flatMap(v=>revisionEvidence(v.transaction.id))];
  };
  function add(type:QualityType,key:string,subject:QualityFinding['subject'],reason:string,impact:QualityImpact,evidence:QualityEvidence[],action:QualityAction|null,limitation:string|null=null,age:number|null=null) {
    const id=`dq1/${h}/${type}/${key}`,old=roots.get(id);
    const impacts=unique([...(old?.impacts??[]),impact]),refs=unique([...(old?.evidence??[]),...evidence]);
    if(refs.length>10000 || impacts.length>10000)throw new RangeError('Quality evidence bound');
    roots.set(id,{id,type,householdId:h,subject,reasons:unique([...(old?.reasons??[]),reason]),explanation:explanations[type],
      state:impacts.some(i=>i.state==='UNKNOWN')?'UNKNOWN':impacts.some(i=>i.state==='UNAVAILABLE')?'UNAVAILABLE':'PARTIAL',
      evidence:refs,impacts,action:action??old?.action??null,limitation:limitation??old?.limitation??null,observationAgeDays:age??old?.observationAgeDays??null});
    if(roots.size>2000)throw new RangeError('Quality finding bound');
  }
  const impact=(module:QualityModule,resultId:string,state:Coverage='PARTIAL'):QualityImpact=>({module,resultId,state});
  const rootBalance=(accountId:string,reason:string,i:QualityImpact) => {
    const refs=balanceEvidence(accountId),observation=refs.find(e=>e.kind==='OBSERVATION');
    const a=r.accounts.find(a=>a.account.id===accountId)!;
    add('BALANCE_EVIDENCE',accountId,{kind:'ACCOUNT',id:accountId},reason,i,refs,a.account.balancePolicy==='LEDGER'?'TRANSACTIONS':'ACCOUNTS',
      a.account.status==='ARCHIVED'?'החשבון בארכיון; מסך הבדיקה אינו מאפשר תיקון כספי חדש בחשבון זה.':null,
      observation?.measuredOn?observationAge(observation.measuredOn,q.asOf):null);
  };
  const fx=(original:string,target:string,date:string,reason:string,i:QualityImpact,evidence:QualityEvidence[]) => {
    const key=`${original}/${target}/${date}`;
    const rates=r.rates.filter(e=>e.householdId===h && e.rate.base===original && e.rate.quote===target && e.rate.effectiveDate===date)
      .map(e=>({kind:'FX' as const,id:e.rate.id,version:null,sourceId:e.rate.origin.sourceId,measuredOn:e.rate.effectiveDate,recordedAt:e.rate.recordedAt,currency:e.rate.base}));
    add('HISTORICAL_FX',key,{kind:'FX_PAIR',id:key},reason,i,[...evidence,...rates],null,'אין כרגע מסך להזנת שער היסטורי עצמאי או לרכישת שערים.');
  };
  const relationship=(id:string,reason:string,i:QualityImpact) => {
    const decisions=r.decisions.filter(d=>d.householdId===h && d.id===id).sort((a,b)=>b.version-a.version),d=decisions[0];
    if(!d)throw new RangeError('Quality relationship');
    add('RECONCILIATION_EVIDENCE',id,{kind:'RELATIONSHIP',id},reason,i,[{kind:'RECONCILIATION',id,version:d.version,sourceId:null,measuredOn:null,recordedAt:d.recordedAt,currency:null},
      ...d.participants.flatMap(p=>[...revisionEvidence(p.selection.transactionId),...revisionEvidence(p.selection.transactionId,p.selection.revisionId)])],'RECONCILIATION');
  };
  const unclassified=(id:string,i:QualityImpact) => add('UNCLASSIFIED_EFFECT',id,{kind:'TRANSACTION',id},'UNCLASSIFIED',i,revisionEvidence(id),'TRANSACTIONS');

  // Main positions use the canonical balance authority; budget reporting does not add another valuation.
  for(const p of report.positions) {
    if(p.reason) {rootBalance(p.account.id,p.reason,impact('BALANCE',p.account.id,p.coverage));rootBalance(p.account.id,p.reason,impact('NET_WORTH',q.asOf,report.netWorth.coverage));}
    if(p.amount?.reason)fx(p.amount.original.currency,q.currency,q.asOf,p.amount.reason,impact('NET_WORTH',q.asOf,report.netWorth.coverage),balanceEvidence(p.account.id));
    if(p.account.balancePolicy==='OBSERVED') {
      const record=r.accounts.find(a=>a.account.id===p.account.id)!;
      const value=valueAccount(record,r.observations,q.asOf);
      if(value.state==='MISSING_FX') {
        const key=`${p.account.currency}/${p.account.valuationCurrency}/${value.observation.date}`;
        add('HISTORICAL_FX',key,{kind:'FX_PAIR',id:key},'OBSERVATION_FX_MISSING',impact('BALANCE',p.account.id),balanceEvidence(p.account.id),
          value.observation.sourceId===record.manualSourceId && p.account.status==='ACTIVE'?'ACCOUNTS':null,
          'במסך החשבונות אפשר לבדוק שער המצורף לתצפית ידנית. אין מסך עצמאי לניהול שערי הדוחות או לתיקון מקור שאינו ידני.');
      }
    }
  }
  function monthlyFindings(model:typeof report,targets:QualityImpact[]) {
    for(const w of model.warnings) for(const i of targets) {
      if(w.code==='INCOMPLETE_LEDGER_PERIOD' && w.accountId) {
        // Group with missing/partial opening, but preserve a distinct historical-period limitation when today's balance is complete.
        const a=r.accounts.find(a=>a.account.id===w.accountId)!;
        const start=ledgerBalance(a,r.history.filter(v=>v.transaction.accountId===w.accountId),model.period.start);
        rootBalance(w.accountId,start.state==='UNKNOWN'?start.reason:start.state==='INCOMPLETE'?'PARTIAL_OPENING':w.code,i);
      } else if(w.code==='UNCLASSIFIED' && w.transactionId)unclassified(w.transactionId,i);
      else if(w.relationshipId && model.monthly.issues.includes(w.code))relationship(w.relationshipId,w.code,i);
    }
    for(const c of model.monthly.conversions) if(c.amount.reason)for(const i of targets)
      fx(c.amount.original.currency,model.request.currency,c.date,c.amount.reason,i,revisionEvidence(c.transactionId));
  }
  monthlyFindings(report,[impact('MONTHLY',`${q.month}/${q.currency}`,report.monthly.coverage)]);
  const affectedBudgets=budget.comparisons.filter(c=>c.plan.status==='ACTIVE' && c.coverage==='INCOMPLETE');
  monthlyFindings(budget.report,affectedBudgets.map(c=>impact('BUDGET',c.plan.id)));
  for(const c of affectedBudgets) if(c.issues.includes('UNCATEGORIZED_SCOPE'))for(const e of budget.report.expenses.filter(e=>e.categoryId===null))
    add('CATEGORY_SCOPE',e.transactionId,{kind:'TRANSACTION',id:e.transactionId},'UNCATEGORIZED_SCOPE',impact('BUDGET',c.plan.id),revisionEvidence(e.transactionId),'CATEGORIES');
  for(const w of report.warnings)if(w.relationshipId)relationship(w.relationshipId,w.code,impact('RECONCILIATION',w.relationshipId));

  function payment(e:typeof expected[number],reason:string,i:QualityImpact) {
    const v=e.obligation,d=e.link;
    add('PAYMENT_EVIDENCE',e.id,{kind:'OCCURRENCE',id:e.id},reason,i,[{kind:'OBLIGATION',id:v.id,version:v.version,sourceId:null,measuredOn:e.date,recordedAt:v.recordedAt,currency:e.money.currency},
      ...(d?[{kind:'PAYMENT' as const,id:d.id,version:d.version,sourceId:null,measuredOn:d.date,recordedAt:d.recordedAt,currency:d.actual?.currency??null},...revisionEvidence(d.evidence!.transactionId),...revisionEvidence(d.evidence!.transactionId,d.evidence!.revisionId)]:[])],'OBLIGATIONS');
  }
  for(const e of expected)if(e.state!=='ASSOCIATED')payment(e,`PAYMENT_${e.state}`,impact('OBLIGATIONS',e.id,e.state==='UNRESOLVED'?'UNKNOWN':'PARTIAL'));
  if(forecast && request.forecast)for(const d of forecast.diagnostics) {
    const i=impact('FORECAST',`${request.forecast.start}/${request.forecast.horizon}`,forecast.coverage);
    if(d.accountId && balanceReasons.has(d.code))rootBalance(d.accountId,d.code,i);
    else if(d.accountId && (d.code==='MISSING_FX'||d.code==='AMBIGUOUS_FX')) {
      const a=report.positions.find(p=>p.account.id===d.accountId)!;fx(a.account.currency,q.currency,q.asOf,d.code,i,balanceEvidence(d.accountId));
    } else if(d.code==='UNCLASSIFIED' && d.evidenceId)unclassified(d.evidenceId,i);
    else if(d.code==='RECONCILIATION_UNRESOLVED' && d.evidenceId)relationship(d.evidenceId,d.code,i);
    else {
      const event=forecast.events.find(e=>e.id===d.evidenceId);
      const occurrence=forecastExpected.find(e=>e.id===d.evidenceId);
      if(occurrence && (d.code.startsWith('PAYMENT_') || d.code==='BASELINE_OBLIGATION_UNRESOLVED'))payment(occurrence,d.code,i);
      else {
        const transaction=d.evidenceId?context.current.find(v=>v.transaction.householdId===h && v.transaction.id===d.evidenceId):undefined;
        const refs=transaction?revisionEvidence(transaction.transaction.id):occurrence?[{kind:'OBLIGATION' as const,id:occurrence.obligation.id,version:occurrence.obligation.version,sourceId:null,measuredOn:occurrence.date,recordedAt:occurrence.obligation.recordedAt,currency:occurrence.money.currency}]:d.accountId?balanceEvidence(d.accountId):[];
        const unsupported=['CARD_CASH_TIMING_UNKNOWN','LOAN_CASH_TIMING_UNKNOWN','FUTURE_FX_UNKNOWN','FUTURE_INCOME_UNSUPPORTED','FUTURE_INFLOW_UNCONFIRMED','STARTING_CURRENCY_EXPOSURE'].includes(d.code);
        add('CALCULATION_LIMITATION',`${d.code}/${d.evidenceId??d.accountId??h}`,{kind:transaction?'TRANSACTION':event?'OCCURRENCE':d.accountId?'ACCOUNT':'HOUSEHOLD',id:d.evidenceId??d.accountId??h},d.code,i,refs,
          unsupported?null:'FORECAST',unsupported?'אין כרגע תהליך נתמך לפתרון מגבלת התכנון הזו. הראיות המקוריות נשמרות והסכום הפנוי נשאר לא זמין.':null);
      }
    }
  }
  return {version:1,householdId:h,capturedAt:s.capturedAt,request,externalCoverage:'UNKNOWN',findings:[...roots.values()].sort((a,b)=>order(a.id,b.id)),
    calculations:[{module:'NET_WORTH',state:report.netWorth.coverage},{module:'MONTHLY',state:report.monthly.coverage},
      {module:'BUDGET',state:!selectedBudgets.length?'NO_PLAN':affectedBudgets.length?'PARTIAL':'COMPLETE'},
      {module:'OBLIGATIONS',state:expected.some(e=>e.state!=='ASSOCIATED')?'PARTIAL':'COMPLETE'},
      {module:'FORECAST',state:forecast?.coverage??'NOT_EVALUATED'}]};
}
