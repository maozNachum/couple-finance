-- Blank references are absence of evidence, not a shared financial identity.
-- Exact original references and independent date/amount/description predicates are unchanged.
create or replace function private.import_duplicates(h uuid,a uuid,s uuid,filehash text,rows jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('row',(row->>'row')::int,'exact',prior.id is not null,
 'reasons',to_jsonb(array_remove(array[
 case when prior.id is not null then case when prior.row_hash=row->>'rowHash' then 'PRIOR_IMPORT' else 'INTERPRETATION_CHANGED' end end,
 case when matches.same_reference then 'SAME_REFERENCE' end,
 case when matches.same_values then 'SAME_FINANCIAL_VALUES' end,
 case when matches.total>0 and not matches.same_values and not matches.same_reference then 'SAME_DATE_AMOUNT' end,
 case when exists(select 1 from jsonb_array_elements(rows) other where other->>'row'<>row->>'row' and other->>'state'='VALID' and other->'date'=row->'date' and other->'money'=row->'money') then 'REPEATED_IN_FILE' end
 ],null)), 'candidates',coalesce(matches.ids,'[]'), 'candidateCount',matches.total) order by (row->>'row')::int),'[]')
 from jsonb_array_elements(rows) row
 left join finance.import_rows prior on prior.household_id=h and prior.account_id=a and prior.source_id=s and prior.content_hash=filehash and prior.row_number=(row->>'row')::int
 cross join lateral (
 select count(*) total,coalesce(bool_or(x.same_reference),false) same_reference,coalesce(bool_or(x.same_values),false) same_values,
 (select coalesce(jsonb_agg(y.transaction_id),'[]') from (select tr.transaction_id from finance.transaction_revisions tr
 where tr.household_id=h and tr.account_id=a and tr.status<>'VOIDED' and not exists(select 1 from finance.transaction_revisions newer where newer.supersedes_revision_id=tr.revision_id)
 and ((tr.body->>'transactionDate'=row->>'date' and tr.amount=(row->'money'->>'amount')::numeric and tr.currency=row->'money'->>'currency')
 or exists(select 1 from finance.import_rows ir where ir.household_id=h and ir.account_id=a and ir.source_id=s and ir.transaction_id=tr.transaction_id and nullif(btrim(ir.source_reference,E' \t\n\r\f'||chr(11)||U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'') is not null and ir.source_reference=row->>'reference')) order by tr.transaction_id limit 10) y) ids
 from (select tr.transaction_id,
 exists(select 1 from finance.import_rows ir where ir.household_id=h and ir.account_id=a and ir.source_id=s and ir.transaction_id=tr.transaction_id and nullif(btrim(ir.source_reference,E' \t\n\r\f'||chr(11)||U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'') is not null and ir.source_reference=row->>'reference') same_reference,
 (tr.body->>'transactionDate'=row->>'date' and tr.amount=(row->'money'->>'amount')::numeric and tr.currency=row->'money'->>'currency' and private.normalize_category_text(tr.body->>'description')=private.normalize_category_text(row->>'description')) same_values
 from finance.transaction_revisions tr where tr.household_id=h and tr.account_id=a and tr.status<>'VOIDED' and not exists(select 1 from finance.transaction_revisions newer where newer.supersedes_revision_id=tr.revision_id)
 and ((tr.body->>'transactionDate'=row->>'date' and tr.amount=(row->'money'->>'amount')::numeric and tr.currency=row->'money'->>'currency')
 or exists(select 1 from finance.import_rows ir where ir.household_id=h and ir.account_id=a and ir.source_id=s and ir.transaction_id=tr.transaction_id and nullif(btrim(ir.source_reference,E' \t\n\r\f'||chr(11)||U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'') is not null and ir.source_reference=row->>'reference'))) x
 ) matches;
$$;
