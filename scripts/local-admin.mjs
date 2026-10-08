import { randomUUID } from 'node:crypto';
import { localAdmin, localSql, localStatus, sqlText, uuid } from './local-supabase.mjs';

// Local-only operator workflow. Never use service credentials in the browser.
localStatus();
const [command, first, second, third] = process.argv.slice(2);
if (command === 'create-household' && first?.trim() && first.length <= 100) {
  const id = randomUUID();
  localSql(`insert into finance.households(id,name) values ('${id}',${sqlText(first.trim())});`);
  console.log(`Created household ${id}`);
} else if (command === 'invite' && first && second && third?.trim() && third.length <= 100) {
  const household = uuid(first);
  if (localSql(`select count(*) from finance.households where id='${household}'`) !== '1') throw new Error('Unknown household.');
  const admin = localAdmin();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(second, { redirectTo: 'http://127.0.0.1:5173/auth/confirm' });
  if (error || !data.user) throw new Error('Invitation failed. No membership was granted.');
  const userId = uuid(data.user.id);
  try {
    localSql(`begin; insert into finance.profiles(id,display_name) values ('${userId}',${sqlText(third.trim())}); insert into finance.household_members(household_id,user_id) values ('${household}','${userId}'); commit;`);
  } catch {
    // Invitation alone grants no household access; compensate a failed provisioning attempt.
    await admin.auth.admin.deleteUser(userId);
    throw new Error('Provisioning failed. No membership was granted.');
  }
  console.log('Invitation captured by local Mailpit; membership provisioned.');
} else if (command === 'revoke' && first && second) {
  localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(first)}' and user_id='${uuid(second)}';`);
  console.log('Membership revoked. Existing JWTs no longer authorize household access.');
} else {
  throw new Error('Usage: local:admin -- create-household NAME | invite HOUSEHOLD_UUID EMAIL DISPLAY_NAME | revoke HOUSEHOLD_UUID USER_UUID');
}
