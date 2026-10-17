import { goalRevisionSchema, goalsSnapshotSchema } from '../contracts/goals.ts';
import type { GoalRevision } from '../contracts/goals.ts';
import { financialDateSchema } from '../contracts/financial-date.ts';
import { moneySchema } from '../contracts/money.ts';
import { addMoney, subtractMoney, compareMoney, scaleMoney } from './money/money.ts';
import { decimal, divide, multiply, compare, add } from './money/decimal.ts';
import type { DecimalString } from './money/decimal.ts';
import { timestampOrder } from './money/ledger.ts';

/** Validate the complete bounded planning graph, never truncate history. */
export function validateGoalsSnapshot(input: unknown) {
  const s = goalsSnapshotSchema.parse(input);
  const households = new Set(s.households.map(h => h.id));
  const members = new Map(s.members.map(m => [m.id,m]));
  if (households.size !== s.households.length || members.size !== s.members.length) throw new RangeError('Duplicate identity');
  for (const m of s.members) if (!households.has(m.householdId)) throw new RangeError('Foreign member');
  const groups = new Map<string,GoalRevision[]>();
  for (const r of s.revisions) {
    if (!households.has(r.householdId) || members.get(r.actorMemberId)?.householdId !== r.householdId ||
      r.ownership.kind === 'MEMBER' && members.get(r.ownership.memberId)?.householdId !== r.householdId) throw new RangeError('Foreign goal');
    const rows = groups.get(r.id) ?? []; rows.push(r); groups.set(r.id,rows);
  }
  for (const rows of groups.values()) {
    rows.sort((a,b) => a.version-b.version);
    const first = rows[0]!;
    for (let i=0;i<rows.length;i++) {
      const r=rows[i]!, previous=rows[i-1];
      if (r.version !== i+1 || r.householdId !== first.householdId || r.target.currency !== first.target.currency ||
        JSON.stringify(r.ownership) !== JSON.stringify(first.ownership) ||
        (!previous && r.status !== 'ACTIVE') || previous && (previous.status === 'ARCHIVED' || timestampOrder(previous.recordedAt)>timestampOrder(r.recordedAt)))
        throw new RangeError('Invalid goal history');
      if (r.status === 'ARCHIVED' && previous &&
        JSON.stringify([r.name,r.target,r.declared,r.monthly,r.targetDate]) !== JSON.stringify([previous.name,previous.target,previous.declared,previous.monthly,previous.targetDate]))
        throw new RangeError('Archive changed plan');
    }
  }
  return s;
}

// Use only the established exact decimal wrapper. Correct a rounded-down
// quotient by one eight-place unit, without changing shared rounding policies.
function ceilMonthly(amount: DecimalString, months: number): DecimalString {
  const count=decimal(String(months));
  const rounded=divide(amount,count,{scale:8,mode:'HALF_UP'});
  return compare(multiply(rounded,count),amount)<0?add(rounded,decimal('0.00000001')):rounded;
}
export function calculateGoal(input: unknown, planningDate: unknown) {
  const g=goalRevisionSchema.parse(input), day=financialDateSchema.parse(planningDate);
  const zero=moneySchema.parse({amount:'0',currency:g.target.currency});
  const difference=subtractMoney(g.target,g.declared);
  const remaining=compareMoney(difference,zero)>0?difference:zero;
  const surplus=compareMoney(difference,zero)<0?subtractMoney(g.declared,g.target):zero;
  const percentage=compareMoney(g.declared,g.target)>=0?'100':divide(multiply(g.declared.amount,decimal('100')),g.target.amount,{scale:2,mode:'HALF_UP'});
  let months: number|null=null;
  let deadline:'NO_DEADLINE'|'FUTURE'|'IMMEDIATE'|'OVERDUE'='NO_DEADLINE';
  if(g.targetDate){
    const year=Number(day.slice(0,4)), month=Number(day.slice(5,7));
    months=Math.max(0,(Number(g.targetDate.slice(0,4))-year)*12+Number(g.targetDate.slice(5,7))-month);
    deadline=g.targetDate<day?'OVERDUE':months===0?'IMMEDIATE':'FUTURE';
  }
  const requiredMonthly=months!==null&&months>0?moneySchema.parse({amount:ceilMonthly(remaining.amount,months),currency:g.target.currency}):null;
  const immediatelyRequired=months===0?remaining:null;
  const outcome=g.monthly&&months!==null&&deadline!=='OVERDUE'?addMoney(g.declared,scaleMoney(g.monthly,decimal(String(months)))):null;
  const plannedDifference=outcome?subtractMoney(outcome,g.target):null;
  return {target:g.target,declared:g.declared,remaining,surplus,percentage,months,deadline,requiredMonthly,immediatelyRequired,
    outcome,plannedDifference,verifiedFunding:'NOT_ESTABLISHED' as const,planningDate:day};
}
