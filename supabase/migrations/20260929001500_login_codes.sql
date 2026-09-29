-- "Login codes" inbox: while no SMS provider is connected (SMS_PROVIDER = inbox), the
-- send-sms hook stores each OTP here so an admin can forward it (e.g. on WhatsApp).
-- Only the send-sms function (service role) writes; admins with can_view_login_codes read.
-- Codes are removed when they expire or as soon as that phone signs in.

create table public.login_codes (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  code       text not null,
  message    text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index login_codes_expires_idx on public.login_codes (expires_at);

alter table public.login_codes enable row level security;

create policy login_codes_read on public.login_codes for select
  using (public.has_permission('can_view_login_codes'));
create policy login_codes_delete on public.login_codes for delete
  using (public.has_permission('can_view_login_codes'));

-- Signed in -> that phone's pending codes are no longer needed.
create or replace function public.clear_login_codes()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.login_codes where phone = new.phone;
  return new;
end;
$$;

revoke execute on function public.clear_login_codes() from public, anon, authenticated;

create trigger on_auth_user_signed_in
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.clear_login_codes();

-- Expired codes are swept every 10 minutes (send-sms also clears them on each new code).
select cron.schedule(
  'login-codes-cleanup',
  '*/10 * * * *',
  $$delete from public.login_codes where expires_at < now()$$
);

-- The admin role can see the inbox.
update public.roles
   set permissions = permissions || '{"can_view_login_codes": true}'::jsonb
 where name = public.setting_text('ADMIN_ROLE_NAME');

-- Allow the generic list/delete RPCs on this table (reads still go through RLS).
create or replace function public.crud_assert_table(p_table text)
returns void
language plpgsql immutable
set search_path = public
as $$
begin
  if p_table is null or not (p_table = any (array[
    'app_settings', 'roles', 'pricing_plans', 'shops', 'users_profile',
    'stocks', 'vendors', 'vendor_purchases', 'support_tickets', 'stock_reminders',
    'login_codes'
  ])) then
    raise exception 'table % is not available', p_table;
  end if;
end;
$$;
