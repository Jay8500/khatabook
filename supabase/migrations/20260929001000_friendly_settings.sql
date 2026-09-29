-- Admin-friendly settings: a category for grouping, a plain daily reminder time instead of
-- a cron string, and an on-demand reminder check for a shop.

alter table public.app_settings add column if not exists category text not null default 'advanced';

-- ---------------------------------------------------------------------------
-- Reminders: optional shop filter + "check now" for the caller's shops
-- ---------------------------------------------------------------------------
drop function if exists public.generate_stock_reminders();

create or replace function public.generate_stock_reminders(p_shop_id uuid default null)
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
  where t.threshold is not null
    and s.qty <= t.threshold
    and (p_shop_id is null or s.shop_id = p_shop_id)
  on conflict (stock_id, reminder_date) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.generate_stock_reminders(uuid) from public, anon, authenticated;

create or replace function public.generate_my_stock_reminders()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_shop  uuid;
  v_total integer := 0;
begin
  if not public.has_permission('can_manage_own_shop') then
    raise exception 'permissionDenied';
  end if;
  for v_shop in select public.my_shop_ids() loop
    v_total := v_total + public.generate_stock_reminders(v_shop);
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.generate_my_stock_reminders() from public, anon;
grant execute on function public.generate_my_stock_reminders() to authenticated;

-- ---------------------------------------------------------------------------
-- Daily schedule from STOCK_REMINDER_TIME ("HH:MM") in TIMEZONE, converted to UTC cron
-- ---------------------------------------------------------------------------
create or replace function public.schedule_stock_reminder_cron()
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_time text := public.setting_text('STOCK_REMINDER_TIME');
  v_zone text := coalesce(public.setting_text('TIMEZONE'), 'UTC');
  v_utc  timestamp;
begin
  if exists (select 1 from cron.job where jobname = 'stock-reminder') then
    perform cron.unschedule('stock-reminder');
  end if;
  if coalesce(v_time, '') = '' then
    return;
  end if;

  v_utc := ((current_date + v_time::time) at time zone v_zone) at time zone 'UTC';

  perform cron.schedule(
    'stock-reminder',
    format('%s %s * * *', extract(minute from v_utc)::int, extract(hour from v_utc)::int),
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

drop trigger if exists app_settings_cron_sync on public.app_settings;
create trigger app_settings_cron_sync
  after insert or update on public.app_settings
  for each row
  when (new.key in ('STOCK_REMINDER_TIME', 'TIMEZONE'))
  execute function public.on_cron_setting_change();

-- The old cron-string setting is replaced by STOCK_REMINDER_TIME (seeded next).
delete from public.app_settings where key = 'STOCK_REMINDER_CRON';
