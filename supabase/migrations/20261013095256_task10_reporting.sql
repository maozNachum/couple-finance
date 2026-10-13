-- Same statement snapshot, invoker RLS, complete correction graphs; no financial writes.
create function api.reporting_snapshot() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s jsonb; n bigint;
begin
 if not private.has_live_session() then
  return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_AUTHORIZED','kind','AUTHORIZATION','safeMessage','This action is not permitted.','retryable',false));
 end if;
 if (select count(*) from finance.households)>100
 or (select count(*) from finance.household_members)>1000
 or (select count(*) from finance.accounts)>1000
 or (select count(*) from finance.account_sources)>10000
 or (select count(*) from finance.transaction_revisions)>100000
 or (select count(*) from finance.transaction_allocations)>100000
 or (select count(*) from finance.balance_observations)>100000
 or (select count(*) from finance.reconciliation_decisions)>10000
 or (select count(*) from finance.reconciliation_participants)>100000
 or (select count(*) from finance.fx_evidence)>10000 then
  return jsonb_build_object('ok',false,'error',jsonb_build_object('code','INVALID_INPUT','kind','VALIDATION','safeMessage','Some values are invalid.','retryable',false));
 end if;
 -- Reuse reviewed invoker projections. Omit import candidate references: reporting never matches.
 select jsonb_build_object(
 'households',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by id) from finance.households),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'householdId',household_id,'userId',user_id,'displayName',display_name,'status',status) order by id) from finance.household_members),'[]'::jsonb),
 'accounts',coalesce((select jsonb_agg(payload order by id) from api.accounts),'[]'::jsonb),
 'observations',coalesce((select jsonb_agg(payload order by id) from api.balance_observations),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(payload order by revision_id) from api.transaction_history),'[]'::jsonb),
 'decisions',coalesce((select jsonb_agg(body order by id,version) from finance.reconciliation_decisions),'[]'::jsonb),
 'rates',coalesce((select jsonb_agg(jsonb_build_object('householdId',household_id,'rate',snapshot) order by household_id,id) from finance.fx_evidence),'[]'::jsonb),
 'references','[]'::jsonb) into s;
 select sum(jsonb_array_length(value)) into n from jsonb_each(s);
 s:=s||jsonb_build_object('size',n);
 if octet_length(s::text)>16777216 then
  return jsonb_build_object('ok',false,'error',jsonb_build_object('code','INVALID_INPUT','kind','VALIDATION','safeMessage','Some values are invalid.','retryable',false));
 end if;
 return jsonb_build_object('ok',true,'snapshot',s);
end;
$$;
revoke all on function api.reporting_snapshot() from public,anon,authenticated;
grant execute on function api.reporting_snapshot() to authenticated;
