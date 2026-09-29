-- RPCs the frontend calls through the encrypt-rpc edge function.
-- CRUD RPCs run as the caller (security invoker), so row level security still applies.

-- ---------------------------------------------------------------------------
-- Current user
-- ---------------------------------------------------------------------------
create or replace function public.get_my_context()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile', to_jsonb(up),
    'role', jsonb_build_object('id', r.id, 'name', r.name, 'permissions', coalesce(r.permissions, '{}'::jsonb)),
    'shop', to_jsonb(s)
  )
  from public.users_profile up
  left join public.roles r on r.id = up.role_id
  left join public.shops s on s.id = coalesce(
    up.shop_id,
    (select id from public.shops where owner_user_id = up.id order by created_at limit 1)
  )
  where up.id = auth.uid()
$$;

create or replace function public.set_my_preferences(p_preferences jsonb)
returns jsonb
language sql security invoker
set search_path = public
as $$
  update public.users_profile
     set preferences = preferences || coalesce(p_preferences, '{}'::jsonb)
   where id = auth.uid()
  returning preferences
$$;

-- Username + first shop (on the default plan from app_settings) in one step.
create or replace function public.complete_onboarding(p_username text, p_shop_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_shop uuid;
  v_plan public.pricing_plans;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_username), '') = '' then
    raise exception 'username is required';
  end if;

  perform public.allow_trusted_write();

  update public.users_profile set username = trim(p_username) where id = v_uid;

  if coalesce(trim(p_shop_name), '') <> ''
     and not exists (select 1 from public.shops where owner_user_id = v_uid) then
    select * into v_plan from public.pricing_plans
     where name = public.setting_text('DEFAULT_PLAN_NAME') and is_active
     limit 1;

    insert into public.shops (owner_user_id, name, subscription_plan_id, subscription_expires_at)
    values (
      v_uid,
      trim(p_shop_name),
      v_plan.id,
      case when v_plan.id is null then null else now() + make_interval(days => v_plan.duration_days) end
    )
    returning id into v_shop;

    update public.users_profile set shop_id = v_shop where id = v_uid;
  end if;

  return public.get_my_context();
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Generic CRUD over an allow-list of tables (drives the shared grid/form UI)
-- ---------------------------------------------------------------------------
create or replace function public.crud_assert_table(p_table text)
returns void
language plpgsql immutable
as $$
begin
  if p_table is null or not (p_table = any (array[
    'app_settings', 'roles', 'pricing_plans', 'shops', 'users_profile',
    'stocks', 'vendors', 'vendor_purchases', 'support_tickets', 'stock_reminders'
  ])) then
    raise exception 'table % is not available', p_table;
  end if;
end;
$$;

create or replace function public.crud_columns(p_table text)
returns text[]
language sql stable
set search_path = public
as $$
  select array_agg(column_name::text order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER'
$$;

create or replace function public.crud_pk(p_table text)
returns text
language sql stable
set search_path = public
as $$
  select a.attname::text
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
  where i.indrelid = format('public.%I', p_table)::regclass and i.indisprimary
  limit 1
$$;

-- p_filter: {"column": value, ...} equality filters. p_order: "column" or "column.desc".
create or replace function public.crud_list(
  p_table  text,
  p_filter jsonb default '{}'::jsonb,
  p_order  text default null,
  p_limit  integer default 500
)
returns jsonb
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_cols  text[] := public.crud_columns(p_table);
  v_where text := '';
  v_order text := '';
  v_col   text;
  v_dir   text;
  k       text;
  v       jsonb;
  v_out   jsonb;
begin
  perform public.crud_assert_table(p_table);

  for k, v in select * from jsonb_each(coalesce(p_filter, '{}'::jsonb)) loop
    if not (k = any (v_cols)) then
      raise exception 'unknown column %', k;
    end if;
    if jsonb_typeof(v) = 'null' then
      v_where := v_where || format(' and t.%I is null', k);
    else
      v_where := v_where || format(' and t.%I::text = %L', k, v #>> '{}');
    end if;
  end loop;

  if p_order is not null then
    v_col := split_part(p_order, '.', 1);
    v_dir := case when split_part(p_order, '.', 2) = 'desc' then 'desc' else 'asc' end;
    if not (v_col = any (v_cols)) then
      raise exception 'unknown column %', v_col;
    end if;
    v_order := format(' order by t.%I %s', v_col, v_dir);
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(s)), ''[]''::jsonb) from (select t.* from public.%I t where true%s%s limit %s) s',
    p_table, v_where, v_order, least(greatest(coalesce(p_limit, 500), 1), 5000)
  ) into v_out;
  return v_out;
end;
$$;

-- Insert or update one row. Only keys that are real columns are used, so defaults
-- apply to anything omitted.
create or replace function public.crud_upsert(p_table text, p_row jsonb)
returns jsonb
language plpgsql security invoker
set search_path = public
as $$
declare
  v_pk   text := public.crud_pk(p_table);
  v_cols text[];
  v_list text;
  v_sets text;
  v_out  jsonb;
begin
  perform public.crud_assert_table(p_table);

  select array_agg(c) into v_cols
  from unnest(public.crud_columns(p_table)) c
  where p_row ? c
    and c not in ('created_at', 'updated_at');

  if v_cols is null then
    raise exception 'no known columns in row';
  end if;

  select string_agg(format('%I', c), ', ') into v_list from unnest(v_cols) c;
  select string_agg(format('%I = excluded.%I', c, c), ', ') into v_sets
  from unnest(v_cols) c where c <> v_pk;

  execute format(
    'insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)
     on conflict (%3$I) do %4$s returning to_jsonb(t)',
    p_table, v_list, v_pk,
    case when v_sets is null then 'nothing' else 'update set ' || v_sets end
  ) into v_out using p_row;

  return v_out;
end;
$$;

create or replace function public.crud_delete(p_table text, p_id text)
returns integer
language plpgsql security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  perform public.crud_assert_table(p_table);
  execute format('delete from public.%I where %I::text = $1', p_table, public.crud_pk(p_table))
    using p_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock reminders (called daily by the stock-reminder-cron edge function)
-- ---------------------------------------------------------------------------
create or replace function public.generate_stock_reminders()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_template text := public.setting('REMINDER_MESSAGES') ->> 'low_stock';
  v_count    integer;
begin
  insert into public.stock_reminders (shop_id, stock_id, message, qty, threshold, is_test)
  select
    s.shop_id,
    s.id,
    replace(replace(replace(replace(coalesce(v_template, '{product}'),
      '{product}', s.product_name),
      '{qty}', trim_scale(s.qty)::text),
      '{threshold}', trim_scale(t.threshold)::text),
      '{unit}', coalesce(s.unit, '')),
    s.qty,
    t.threshold,
    s.is_test
  from public.stocks s
  cross join lateral (
    select coalesce(s.low_stock_threshold, public.default_low_stock_threshold()) as threshold
  ) t
  where t.threshold is not null and s.qty <= t.threshold
  on conflict (stock_id, reminder_date) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Cron schedule comes from app_settings STOCK_REMINDER_CRON. The job calls the edge
-- function with the project URL and a shared secret kept in Vault (not in git).
create or replace function public.schedule_stock_reminder_cron()
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_schedule text := public.setting_text('STOCK_REMINDER_CRON');
begin
  if exists (select 1 from cron.job where jobname = 'stock-reminder') then
    perform cron.unschedule('stock-reminder');
  end if;
  if coalesce(v_schedule, '') = '' then
    return;
  end if;
  perform cron.schedule(
    'stock-reminder',
    v_schedule,
    $job$
      select net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
                   || '/functions/v1/stock-reminder-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body    := '{}'::jsonb
      );
    $job$
  );
end;
$$;

create or replace function public.on_cron_setting_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.schedule_stock_reminder_cron();
  return new;
end;
$$;

create trigger app_settings_cron_sync
  after insert or update on public.app_settings
  for each row
  when (new.key = 'STOCK_REMINDER_CRON')
  execute function public.on_cron_setting_change();

-- ---------------------------------------------------------------------------
-- Bill photos: private bucket, first path segment is the shop id
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bills', 'bills', false)
on conflict (id) do nothing;

create policy bills_read on storage.objects for select using (
  bucket_id = 'bills' and public.can_access_shop(((storage.foldername(name))[1])::uuid)
);
create policy bills_insert on storage.objects for insert with check (
  bucket_id = 'bills' and public.can_access_shop(((storage.foldername(name))[1])::uuid)
);
create policy bills_delete on storage.objects for delete using (
  bucket_id = 'bills' and public.can_access_shop(((storage.foldername(name))[1])::uuid)
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.generate_stock_reminders() from public, anon, authenticated;
revoke execute on function public.schedule_stock_reminder_cron() from public, anon, authenticated;
revoke execute on function public.on_cron_setting_change() from public, anon, authenticated;

revoke execute on function public.get_my_context() from public, anon;
grant execute on function public.get_my_context() to authenticated;
revoke execute on function public.set_my_preferences(jsonb) from public, anon;
grant execute on function public.set_my_preferences(jsonb) to authenticated;
revoke execute on function public.complete_onboarding(text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text) to authenticated;
revoke execute on function public.crud_list(text, jsonb, text, integer) from public, anon;
grant execute on function public.crud_list(text, jsonb, text, integer) to authenticated;
revoke execute on function public.crud_upsert(text, jsonb) from public, anon;
grant execute on function public.crud_upsert(text, jsonb) to authenticated;
revoke execute on function public.crud_delete(text, text) from public, anon;
grant execute on function public.crud_delete(text, text) to authenticated;
