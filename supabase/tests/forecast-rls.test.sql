begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
-- Forecast intentionally reuses this unchanged bounded read API; no new writer or table grants.
select ok(not prosecdef and provolatile='s','forecast input is a stable invoker read') from pg_proc where oid='api.obligations_snapshot()'::regprocedure;
select ok(has_function_privilege('authenticated','api.obligations_snapshot()','EXECUTE'),'authorized role may request coherent forecast evidence');
select ok(not has_function_privilege('anon','api.obligations_snapshot()','EXECUTE'),'anonymous forecast input denied');
select ok(not has_table_privilege('authenticated','finance.transaction_revisions','UPDATE'),'forecast caller cannot rewrite transaction history');
select ok(not has_table_privilege('authenticated','finance.transaction_allocations','UPDATE'),'forecast caller cannot rewrite allocations');
select ok(not has_table_privilege('authenticated','finance.obligation_revisions','UPDATE'),'forecast caller cannot rewrite planning history');
select ok(not has_table_privilege('authenticated','finance.obligation_payment_decisions','UPDATE'),'forecast caller cannot rewrite actual associations');
select ok(not has_table_privilege('authenticated','finance.budget_revisions','UPDATE'),'forecast caller cannot rewrite budgets');
select ok(not has_table_privilege('authenticated','finance.reconciliation_decisions','UPDATE'),'forecast caller cannot rewrite reconciliation');
create temporary table forecast_read_counts as select
 (select count(*) from finance.transaction_revisions) as transactions,
 (select count(*) from finance.obligation_revisions) as obligations,
 (select count(*) from finance.obligation_payment_decisions) as payments,
 (select count(*) from finance.budget_revisions) as budgets,
 (select count(*) from finance.reconciliation_decisions) as reconciliation;
grant select on forecast_read_counts to authenticated;
set local role anon;
select throws_ok('select api.obligations_snapshot()','42501',null,'anonymous read invocation denied');
set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select is(api.obligations_snapshot()->'error'->>'code','NOT_AUTHORIZED','missing live session cannot read forecast evidence');
select is(api.obligations_snapshot()->'error'->>'code','NOT_AUTHORIZED','repeated read remains denied');
reset role;
select is((select count(*) from finance.transaction_revisions),(select transactions from forecast_read_counts),'reads preserve transaction history');
select is((select count(*) from finance.obligation_revisions),(select obligations from forecast_read_counts),'reads preserve obligation history');
select is((select count(*) from finance.obligation_payment_decisions),(select payments from forecast_read_counts),'reads preserve actual associations');
select is((select count(*) from finance.budget_revisions),(select budgets from forecast_read_counts),'reads preserve budget history');
select is((select count(*) from finance.reconciliation_decisions),(select reconciliation from forecast_read_counts),'reads preserve reconciliation');
select * from finish();
rollback;
