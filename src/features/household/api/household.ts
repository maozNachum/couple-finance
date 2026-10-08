import { browserClient } from '@/shared/infrastructure/supabase-client';
import { householdListSchema, householdMemberListSchema } from '@finance/contracts/household';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';

export async function loadHouseholds() {
  const client = browserClient();
  if (!client) throw internalSafeError();
  const { data: user, error: userError } = await client.auth.getUser();
  if (userError || !user.user) throw safeErrorSchema.parse({ code: 'NOT_AUTHORIZED', kind: 'AUTHORIZATION', safeMessage: 'This action is not permitted.', retryable: false });
  const [households, members] = await Promise.all([
    client.from('households').select('id,name,created_at').order('created_at'),
    client.from('household_members').select('id,household_id,user_id,status'),
  ]);
  if (households.error || members.error) throw internalSafeError();
  try {
    return {
      households: householdListSchema.parse(households.data.map((row) => ({ id: row.id, name: row.name, createdAt: String(row.created_at).replace(/\+00:00$/, 'Z') }))),
      members: householdMemberListSchema.parse(members.data.map((row) => ({ id: row.id, householdId: row.household_id, userId: row.user_id, status: row.status }))),
    };
  } catch { throw internalSafeError(); }
}
