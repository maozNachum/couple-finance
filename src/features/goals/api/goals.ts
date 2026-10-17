import { browserClient } from '@/shared/infrastructure/supabase-client';
import { goalCommandSchema, goalsResponseSchema } from '@finance/contracts/goals';
import type { GoalCommand } from '@finance/contracts/goals';
import { validateGoalsSnapshot } from '@finance/domain/goals';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';

export async function loadGoals() {
  const client=browserClient(); if(!client) throw internalSafeError();
  try {
    const user=await client.auth.getUser();
    if(user.error && (user.error.status===401||user.error.status===403||user.error.name==='AuthSessionMissingError') || !user.error&&!user.data.user)
      throw safeErrorSchema.parse({code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false});
    if(user.error) throw internalSafeError();
    const response=await client.rpc('goals_snapshot');
    if(response.error) throw internalSafeError();
    const parsed=goalsResponseSchema.parse(response.data);
    if(!parsed.ok) throw parsed.error;
    return validateGoalsSnapshot(parsed.snapshot);
  } catch(error) { const safe=safeErrorSchema.safeParse(error);throw safe.success?safe.data:internalSafeError(); }
}
export async function saveGoal(command:GoalCommand) {
  const input=goalCommandSchema.parse(command),client=browserClient();if(!client)throw internalSafeError();
  let response;
  try{response=await client.rpc('save_goal',{payload:input});}catch{throw internalSafeError();}
  if(response.error)throw internalSafeError();
  if(response.data?.ok===true&&response.data.id===input.id&&response.data.version===input.expectedVersion+1)return;
  const safe=safeErrorSchema.safeParse(response.data?.error);throw safe.success?safe.data:internalSafeError();
}
