import { budgetSnapshotSchema, budgetScopeSchema } from '../contracts/budgets.ts';
import type { BudgetSnapshot, BudgetScope, BudgetRevision } from '../contracts/budgets.ts';
import { reportingRequestSchema } from '../contracts/reporting.ts';
import type { ReportingRequest } from '../contracts/reporting.ts';
import { moneySchema } from '../contracts/money.ts';
import { householdReport } from './reporting.ts';
import { addMoney, subtractMoney } from './money/money.ts';
import { compare, decimal, divide, multiply } from './money/decimal.ts';
import { timestampOrder } from './money/ledger.ts';

const order = (a:string,b:string) => a < b ? -1 : a > b ? 1 : 0;
export function scopesOverlap(left:BudgetScope,right:BudgetScope):boolean {
  const a=budgetScopeSchema.parse(left), b=budgetScopeSchema.parse(right);
  if (a.kind === 'TOTAL' || b.kind === 'TOTAL') return a.kind === b.kind;
  const owners = a.kind === 'ALL' || b.kind === 'ALL' || a.kind === b.kind && a.memberId === b.memberId;
  const categories = a.categoryId === null || b.categoryId === null || a.categoryId === b.categoryId;
  return owners && categories;
}

/** Reject incomplete plan histories/context before presenting any comparison. */
export function currentBudgets(raw:BudgetSnapshot): readonly BudgetRevision[] {
  const s=budgetSnapshotSchema.parse(raw), r=s.reporting;
  const categories=new Map(s.categories.map(c=>[c.id,c]));
  if (categories.size !== s.categories.length || s.categories.some(c=>!r.households.some(h=>h.id===c.householdId))) throw new RangeError('Category context');
  for (const revision of r.history) for (const a of revision.transaction.allocations) if (a.categoryId !== undefined &&
    categories.get(a.categoryId)?.householdId !== revision.transaction.householdId) throw new RangeError('Allocation category context');
  const histories=new Map<string,BudgetRevision[]>();
  for (const b of s.revisions) {
    if (!r.households.some(h=>h.id===b.householdId) || !r.members.some(m=>m.householdId===b.householdId && m.id===b.actorMemberId) ||
      b.scope.memberId !== null && !r.members.some(m=>m.householdId===b.householdId && m.id===b.scope.memberId) ||
      b.scope.categoryId !== null && (categories.get(b.scope.categoryId)?.householdId !== b.householdId || categories.get(b.scope.categoryId)?.kind !== 'EXPENSE' || b.category!.version > categories.get(b.scope.categoryId)!.version)) throw new RangeError('Budget context');
    const rows=histories.get(b.id) ?? []; rows.push(b); histories.set(b.id,rows);
  }
  const heads:BudgetRevision[]=[];
  for (const rows of histories.values()) {
    rows.sort((a,b)=>a.version-b.version);
    const first=rows[0]!;
    for (let i=0;i<rows.length;i++) {
      const b=rows[i]!;
      if (b.version !== i+1 || b.householdId !== first.householdId || b.month !== first.month || b.planned.currency !== first.planned.currency ||
        JSON.stringify(b.scope) !== JSON.stringify(first.scope) || i>0 && (rows[i-1]!.status !== 'ACTIVE' || timestampOrder(b.recordedAt) < timestampOrder(rows[i-1]!.recordedAt)) ||
        i===0 && b.status !== 'ACTIVE' || b.status === 'ARCHIVED' && b.planned.amount !== rows[i-1]?.planned.amount) throw new RangeError('Incomplete budget history');
    }
    heads.push(rows[rows.length-1]!);
  }
  const active=heads.filter(b=>b.status==='ACTIVE');
  for (let i=0;i<active.length;i++) for (let j=i+1;j<active.length;j++) {
    const a=active[i]!,b=active[j]!;
    if (a.householdId===b.householdId && a.month===b.month && (a.planned.currency!==b.planned.currency || scopesOverlap(a.scope,b.scope))) throw new RangeError('Overlapping budgets');
  }
  return heads.sort((a,b)=>order(a.id,b.id));
}

/** Planning only; Task 10 supplies the eligible expense lines and their conversion. */
export function budgetReport(raw:BudgetSnapshot,rawRequest:ReportingRequest) {
  const snapshot=budgetSnapshotSchema.parse(raw), request=reportingRequestSchema.parse(rawRequest);
  const heads=currentBudgets(snapshot);
  const report=householdReport(snapshot.reporting,request);
  const zero=moneySchema.parse({amount:'0',currency:request.currency});
  const matches=(s:BudgetScope,e:typeof report.expenses[number]) =>
    (s.categoryId===null || s.categoryId===e.categoryId) && (s.kind==='TOTAL' || s.kind==='ALL' ||
      s.kind==='SHARED' && e.ownership.kind==='HOUSEHOLD' || s.kind==='MEMBER' && e.ownership.kind==='MEMBER' && s.memberId===e.ownership.memberId);
  const aggregate=(lines:typeof report.expenses) => lines.reduce((sum,e)=>e.amount.money ? addMoney(sum,e.amount.money) : sum,zero);
  const plans=heads.filter(b=>b.householdId===request.householdId && b.month===request.month);
  if (plans.some(b=>b.status==='ACTIVE' && b.planned.currency!==request.currency)) throw new RangeError('Budget reporting currency');
  const comparisons=plans.map(plan=>{
    const lines=report.expenses.filter(e=>matches(plan.scope,e));
    const issues=[...report.monthly.issues];
    if (plan.scope.categoryId!==null && report.expenses.some(e=>e.categoryId===null)) issues.push('UNCATEGORIZED_SCOPE');
    if (plan.planned.currency!==request.currency) issues.push('ARCHIVED_CURRENCY');
    const complete=report.monthly.coverage==='COMPLETE' && issues.length===0;
    const available=lines.some(e=>e.amount.money!==null);
    const actual=complete || available ? aggregate(lines) : null;
    const comparable=complete && plan.status==='ACTIVE' && actual!==null;
    const remaining=comparable ? subtractMoney(plan.planned,actual) : null;
    const over=comparable ? compare(actual.amount,plan.planned.amount)>0 ? subtractMoney(actual,plan.planned) : zero : null;
    const utilization=comparable && compare(plan.planned.amount,decimal('0'))>0 ?
      divide(multiply(actual.amount,decimal('100')),plan.planned.amount,{scale:2,mode:'HALF_UP'}) : null;
    return {plan,actual,remaining,over,utilization,coverage:complete?'COMPLETE' as const:'INCOMPLETE' as const,
      state:plan.status==='ARCHIVED'?'ARCHIVED' as const:!complete?'INCOMPLETE' as const:compare(actual!.amount,plan.planned.amount)>0?'OVER' as const:'WITHIN' as const,
      issues:[...new Set(issues)].sort(order),lines};
  });
  const children=plans.filter(b=>b.status==='ACTIVE' && b.scope.kind!=='TOTAL');
  const unbudgeted=report.expenses.filter(e=>!children.some(b=>matches(b.scope,e)));
  const groups=[...new Set(report.expenses.map(e=>e.categoryId))].sort((a,b)=>order(a??'',b??'')).map(categoryId=>{
    const lines=report.expenses.filter(e=>e.categoryId===categoryId);
    return {categoryId,name:categoryId===null?'ללא קטגוריה':snapshot.categories.find(c=>c.id===categoryId)!.name,
      actual:lines.some(e=>e.amount.money!==null)?aggregate(lines):null,missingFx:lines.filter(e=>e.amount.money===null).length};
  });
  return {report,comparisons,groups,configuration:plans.some(b=>b.status==='ACTIVE')?'CONFIGURED' as const:'NO_PLAN' as const,
    unbudgeted:{actual:report.monthly.coverage==='COMPLETE' || unbudgeted.some(e=>e.amount.money!==null)?aggregate(unbudgeted):null,
      complete:report.monthly.coverage==='COMPLETE',count:unbudgeted.length},
    history:snapshot.revisions.filter(b=>b.householdId===request.householdId && b.month===request.month).sort((a,b)=>order(a.id,b.id)||b.version-a.version)};
}
