import { randomUUID } from 'node:crypto';
import { localAdmin, localSql, uuid } from '../../scripts/local-supabase.mjs';

export async function createFixture() {
  const admin = localAdmin();
  const suffix = randomUUID();
  const users = [];
  const households = [randomUUID(), randomUUID()];
  try {
    for (const label of ['a', 'b']) {
      const email = `synthetic-${label}-${suffix}@example.test`;
      const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email });
      if (error || !data.user || !data.properties) throw new Error('Synthetic invitation failed.');
      users.push({ id: uuid(data.user.id), email, hash: data.properties.hashed_token });
    }
    localSql(`begin;
      insert into finance.households(id,name) values ('${households[0]}','Synthetic household A'),('${households[1]}','Synthetic household B');
      insert into finance.profiles(id,display_name) values ('${users[0].id}','Synthetic A'),('${users[1].id}','Synthetic B');
      insert into finance.household_members(household_id,user_id,display_name) values ('${households[0]}','${users[0].id}','Synthetic A'),('${households[1]}','${users[1].id}','Synthetic B'); commit;`);
    return { users, households, async cleanup() {
      for (const user of users) await admin.auth.admin.deleteUser(user.id);
      // Explicit deletion is limited to this fixture's generated synthetic households.
      localSql(`begin;
        delete from finance.categorization_decisions where household_id in ('${households[0]}','${households[1]}');
        delete from private.categorization_receipts where household_id in ('${households[0]}','${households[1]}');
        delete from private.transaction_receipts where household_id in ('${households[0]}','${households[1]}');
        delete from private.transaction_audit where household_id in ('${households[0]}','${households[1]}');
        delete from finance.transaction_allocations where household_id in ('${households[0]}','${households[1]}');
        delete from finance.transaction_revisions where household_id in ('${households[0]}','${households[1]}');
        delete from finance.transactions where household_id in ('${households[0]}','${households[1]}');
        delete from finance.balance_observations where household_id in ('${households[0]}','${households[1]}');
        delete from finance.fx_evidence where household_id in ('${households[0]}','${households[1]}');
        delete from finance.account_sources where household_id in ('${households[0]}','${households[1]}');
        delete from finance.accounts where household_id in ('${households[0]}','${households[1]}');
        delete from finance.rule_versions where household_id in ('${households[0]}','${households[1]}');
        delete from finance.categorization_rules where household_id in ('${households[0]}','${households[1]}');
        delete from finance.category_versions where household_id in ('${households[0]}','${households[1]}');
        delete from finance.categories where household_id in ('${households[0]}','${households[1]}');
        delete from finance.categorization_catalog where household_id in ('${households[0]}','${households[1]}');
        delete from finance.household_members where household_id in ('${households[0]}','${households[1]}');
        delete from finance.households where id in ('${households[0]}','${households[1]}'); commit;`);
    } };
  } catch (error) { for (const user of users) await admin.auth.admin.deleteUser(user.id); throw error; }
}
