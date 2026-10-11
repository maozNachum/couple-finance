import { browserClient } from '@/shared/infrastructure/supabase-client';
import { categorizationSnapshotSchema, categorizeCommandSchema, definitionCommandSchema } from '@finance/contracts/categorization';
import { accountRecordsSchema } from '@finance/contracts/valuation';
import { transactionRevisionsSchema } from '@finance/contracts/ledger';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';

export async function loadCategorization() {
  const client = browserClient(); if (!client) throw internalSafeError();
  const user = await client.auth.getUser(); if (user.error || !user.data.user) throw internalSafeError();
  const [catalog, transactions] = await Promise.all([client.rpc('categorization_snapshot'), client.rpc('transaction_snapshot')]);
  if (catalog.error || transactions.error) throw internalSafeError();
  try { return { ...categorizationSnapshotSchema.parse(catalog.data), accounts: accountRecordsSchema.parse(transactions.data?.accounts), history: transactionRevisionsSchema.parse(transactions.data?.history) }; }
  catch { throw internalSafeError(); }
}
export async function saveCategorization(kind: 'DEFINITION' | 'DECISION', input: unknown) {
  const parsed = kind === 'DEFINITION' ? definitionCommandSchema.safeParse(input) : categorizeCommandSchema.safeParse(input);
  if (!parsed.success) throw safeErrorSchema.parse({ code: 'INVALID_INPUT', kind: 'VALIDATION', safeMessage: 'Some values are invalid.', retryable: false });
  const client = browserClient(); if (!client) throw internalSafeError();
  let response;
  try { response = await client.rpc(kind === 'DEFINITION' ? 'save_categorization_definition' : 'categorize_transaction', { payload: parsed.data }); }
  catch { throw internalSafeError(); }
  if (response.error) throw internalSafeError();
  if (response.data?.ok === true && (kind === 'DEFINITION' ? 'record' in parsed.data && response.data.id === parsed.data.record.id && response.data.version === parsed.data.record.version : 'revisionId' in parsed.data && response.data.revisionId === parsed.data.revisionId && response.data.version === parsed.data.expectedVersion + 1)) return;
  const error = safeErrorSchema.safeParse(response.data?.error); throw error.success ? error.data : internalSafeError();
}
