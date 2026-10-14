-- One statement/MVCC snapshot, one financial graph, inherited live Auth/RLS.
create function api.data_quality_snapshot() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare obligations jsonb; s jsonb;
begin
 obligations:=api.obligations_snapshot();
 if obligations->>'ok'<>'true' then return obligations; end if;
 if (select count(*) from finance.budget_revisions)>10000
 or (select count(*) from finance.categories)>10000 then return private.account_error('INVALID_INPUT'); end if;
 select jsonb_build_object('version',1,
 'capturedAt',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'obligations',obligations->'snapshot',
 'categories',coalesce((select jsonb_agg(body order by id) from finance.categories),'[]'::jsonb),
 'budgets',coalesce((select jsonb_agg(body order by id,version) from finance.budget_revisions),'[]'::jsonb)) into s;
 s:=s||jsonb_build_object('size',jsonb_array_length(s->'categories')+jsonb_array_length(s->'budgets'));
 if octet_length(s::text)>16777216 then return private.account_error('INVALID_INPUT'); end if;
 return jsonb_build_object('ok',true,'snapshot',s);
end;
$$;
revoke all on function api.data_quality_snapshot() from public,anon,authenticated;
grant execute on function api.data_quality_snapshot() to authenticated;
