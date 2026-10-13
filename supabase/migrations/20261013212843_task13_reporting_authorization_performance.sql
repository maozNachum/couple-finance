-- The reporting bulk-read timeout reproduced with per-row live authorization.
-- Materialize the caller's permitted household IDs once per statement, preserving
-- the same live-session and ACTIVE membership predicates as is_household_member.
-- No financial semantics, existing migration, view or timeout is changed.
create function private.live_household_ids() returns uuid[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(m.household_id),'{}'::uuid[])
 from finance.household_members m
 where m.user_id=(select auth.uid()) and m.status='ACTIVE'
 and (select private.has_live_session());
$$;
revoke all on function private.live_household_ids() from public,anon,authenticated;
grant execute on function private.live_household_ids() to authenticated;

-- The uncorrelated ARRAY subquery is an InitPlan. A correlated per-row SELECT
-- around is_household_member(household_id) would still repeat authorization.
alter policy transactions_read on finance.transactions
 using (household_id=any(array(select unnest(private.live_household_ids()))));
alter policy revisions_read on finance.transaction_revisions
 using (household_id=any(array(select unnest(private.live_household_ids()))));
alter policy allocations_read on finance.transaction_allocations
 using (household_id=any(array(select unnest(private.live_household_ids()))));
