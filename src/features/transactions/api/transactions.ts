import { browserClient } from '@/shared/infrastructure/supabase-client';
import { accountRecordsSchema } from '@finance/contracts/valuation';
import { householdMemberListSchema } from '@finance/contracts/household';
import { manualTransactionCommandSchema, transactionRevisionsSchema } from '@finance/contracts/ledger';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';

export async function loadTransactions() {
  const client = browserClient();
  if (!client) throw internalSafeError();
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) throw internalSafeError();
  const [snapshot, members] = await Promise.all([client.rpc('transaction_snapshot'), client.from('household_members').select('id,household_id,user_id,display_name,status')]);
  if (snapshot.error || members.error) throw internalSafeError();
  try {
    return {
      accounts: accountRecordsSchema.parse(snapshot.data?.accounts), history: transactionRevisionsSchema.parse(snapshot.data?.history),
      members: householdMemberListSchema.parse(members.data.map((r) => ({ id: r.id, householdId: r.household_id, userId: r.user_id, displayName: r.display_name, status: r.status }))),
    };
  } catch { throw internalSafeError(); }
}
export async function recordTransaction(input: unknown) {
  const parsed = manualTransactionCommandSchema.safeParse(input);
  if (!parsed.success) throw safeErrorSchema.parse({ code: 'INVALID_INPUT', kind: 'VALIDATION', safeMessage: 'Some values are invalid.', retryable: false });
  const client = browserClient(); if (!client) throw internalSafeError();
  let response;
  try { response = await client.rpc('record_transaction', { payload: parsed.data }); } catch { throw internalSafeError(); }
  if (response.error) throw internalSafeError();
  if (response.data?.ok === true && response.data.revisionId === parsed.data.revisionId && response.data.version === parsed.data.expectedVersion + 1) return;
  const error = safeErrorSchema.safeParse(response.data?.error);
  throw error.success ? error.data : internalSafeError();
}
