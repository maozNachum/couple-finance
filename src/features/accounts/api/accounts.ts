import { browserClient } from '@/shared/infrastructure/supabase-client';
import { accountRecordsSchema, observationsSchema, createAccountSchema, updateAccountSchema, observationInputSchema } from '@finance/contracts/valuation';
import { householdListSchema, householdMemberListSchema } from '@finance/contracts/household';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';
import { transactionRevisionsSchema } from '@finance/contracts/ledger';

function clientOrThrow() { const client = browserClient(); if (!client) throw internalSafeError(); return client; }
const invalid = () => safeErrorSchema.parse({ code: 'INVALID_INPUT', kind: 'VALIDATION', safeMessage: 'Some values are invalid.', retryable: false });
export async function loadAccounts() {
  const client = clientOrThrow();
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) throw internalSafeError();
  // One database snapshot keeps correction chains coherent and avoids Data API row truncation.
  const [snapshot, households, members] = await Promise.all([
    client.rpc('transaction_snapshot'),
    client.from('households').select('id,name,created_at'),
    client.from('household_members').select('id,household_id,user_id,display_name,status'),
  ]);
  if (snapshot.error || households.error || members.error) throw internalSafeError();
  try {
    return {
      accounts: accountRecordsSchema.parse(snapshot.data?.accounts), observations: observationsSchema.parse(snapshot.data?.observations),
      ledgerHistory: transactionRevisionsSchema.parse(snapshot.data?.history),
      households: householdListSchema.parse(households.data.map((row) => ({ id: row.id, name: row.name, createdAt: String(row.created_at).replace(/\+00:00$/, 'Z') }))),
      members: householdMemberListSchema.parse(members.data.map((row) => ({ id: row.id, householdId: row.household_id, userId: row.user_id, displayName: row.display_name, status: row.status }))),
    };
  } catch { throw internalSafeError(); }
}
export async function accountCommand(command: 'create_account' | 'update_account' | 'record_balance', input: unknown) {
  const schema = command === 'create_account' ? createAccountSchema : command === 'update_account' ? updateAccountSchema : observationInputSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalid();
  let response;
  try { response = await clientOrThrow().rpc(command, { payload: parsed.data }); } catch { throw internalSafeError(); }
  if (response.error) throw internalSafeError();
  if (response.data?.ok === true) return;
  const error = safeErrorSchema.safeParse(response.data?.error);
  throw error.success ? error.data : internalSafeError();
}
