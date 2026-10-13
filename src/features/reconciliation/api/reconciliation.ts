import { browserClient } from '@/shared/infrastructure/supabase-client';
import { reconciliationCommandSchema, reconciliationSnapshotSchema } from '@finance/contracts/reconciliation';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';

export async function loadReconciliation() {
  const client=browserClient();if(!client)throw internalSafeError();
  const user=await client.auth.getUser();
  const denied=user.error&&(user.error.status===401||user.error.status===403||user.error.name==='AuthSessionMissingError');
  if(user.error&&!denied)throw internalSafeError();
  if(denied||!user.data.user)throw safeErrorSchema.parse({code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false});
  const response=await client.rpc('reconciliation_snapshot');
  if(response.error)throw internalSafeError();
  const parsed=reconciliationSnapshotSchema.safeParse(response.data);
  if(!parsed.success)throw internalSafeError();
  return parsed.data;
}
export async function saveReconciliation(input:unknown) {
  const parsed=reconciliationCommandSchema.safeParse(input);
  if(!parsed.success)throw safeErrorSchema.parse({code:'INVALID_INPUT',kind:'VALIDATION',safeMessage:'Some values are invalid.',retryable:false});
  const client=browserClient();if(!client)throw internalSafeError();
  let response;try{response=await client.rpc('reconcile',{payload:parsed.data});}catch{throw internalSafeError();}
  if(response.error)throw internalSafeError();
  if(response.data?.ok===true&&response.data.id===parsed.data.id&&response.data.version===parsed.data.expectedVersion+1)return;
  const error=safeErrorSchema.safeParse(response.data?.error);throw error.success?error.data:internalSafeError();
}
