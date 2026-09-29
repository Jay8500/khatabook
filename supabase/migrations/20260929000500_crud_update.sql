-- Partial update of one row. Unlike crud_upsert (insert-first), this never needs the
-- row's other NOT NULL columns, so edits can send only what changed.
create or replace function public.crud_update(p_table text, p_id text, p_changes jsonb)
returns jsonb
language plpgsql security invoker
set search_path = public
as $$
declare
  v_pk   text := public.crud_pk(p_table);
  v_sets text;
  v_out  jsonb;
begin
  perform public.crud_assert_table(p_table);

  select string_agg(format('%1$I = (jsonb_populate_record(null::public.%2$I, $2)).%1$I', c, p_table), ', ')
    into v_sets
  from unnest(public.crud_columns(p_table)) c
  where p_changes ? c
    and c not in ('created_at', 'updated_at')
    and c <> v_pk;

  if v_sets is null then
    raise exception 'no known columns in changes';
  end if;

  execute format(
    'update public.%1$I as t set %2$s where t.%3$I::text = $1 returning to_jsonb(t)',
    p_table, v_sets, v_pk
  ) into v_out using p_id, p_changes;

  if v_out is null then
    raise exception 'not_found';
  end if;
  return v_out;
end;
$$;

revoke execute on function public.crud_update(text, text, jsonb) from public, anon;
grant execute on function public.crud_update(text, text, jsonb) to authenticated;
