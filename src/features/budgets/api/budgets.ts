import { browserClient } from '@/shared/infrastructure/supabase-client';
import { budgetResponseSchema, budgetCommandSchema } from '@finance/contracts/budgets';
import type { BudgetCommand } from '@finance/contracts/budgets';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';

export async function loadBudgets() {
  const client=browserClient(); if (!client) throw internalSafeError();
  try {
    const user=await client.auth.getUser();
    if (user.error && (user.error.status===401 || user.error.status===403 || user.error.name==='AuthSessionMissingError') || !user.error && !user.data.user)
      throw safeErrorSchema.parse({code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false});
    if (user.error) throw internalSafeError();
    const response=await client.rpc('budget_snapshot');
    if (response.error) throw internalSafeError();
    const parsed=budgetResponseSchema.parse(response.data);
    if (!parsed.ok) throw parsed.error;
    return parsed.snapshot;
  } catch (error) {
    const safe=safeErrorSchema.safeParse(error); throw safe.success?safe.data:internalSafeError();
  }
}
export async function saveBudget(command:BudgetCommand) {
  const input=budgetCommandSchema.parse(command), client=browserClient(); if (!client) throw internalSafeError();
  let response;
  try { response=await client.rpc('save_budget',{payload:input}); } catch { throw internalSafeError(); }
  if (response.error) throw internalSafeError();
  if (response.data?.ok===true && response.data.id===input.id && response.data.version===input.expectedVersion+1) return;
  const error=safeErrorSchema.safeParse(response.data?.error); throw error.success?error.data:internalSafeError();
}
