-- Permissions come from roles.permissions jsonb; nothing checks role names in code.
-- Which role a user gets is decided by app_settings ADMIN_PHONES / ADMIN_ROLE_NAME /
-- DEFAULT_ROLE_NAME, and re-evaluated whenever those settings change.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p text)
returns text
language sql immutable
as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
$$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select (r.permissions ->> p_permission)::boolean
    from public.users_profile up
    join public.roles r on r.id = up.role_id
    where up.id = auth.uid()
  ), false)
$$;

-- Shops the current user owns or belongs to.
create or replace function public.my_shop_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.shops where owner_user_id = auth.uid()
  union
  select shop_id from public.users_profile where id = auth.uid() and shop_id is not null
$$;

create or replace function public.can_access_shop(p_shop_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.has_permission('can_manage_shops')
      or (public.has_permission('can_manage_own_shop') and p_shop_id in (select public.my_shop_ids()))
$$;

create or replace function public.role_id_by_setting(p_setting text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.roles where name = public.setting_text(p_setting)
$$;

create or replace function public.is_admin_phone(p_phone text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(coalesce(public.setting('ADMIN_PHONES'), '[]'::jsonb)) as a(phone)
    where public.normalize_phone(a.phone) = public.normalize_phone(p_phone)
  )
$$;

-- Trusted server functions set this transaction-local flag to pass the column guards below.
create or replace function public.allow_trusted_write()
returns void
language sql
as $$
  select set_config('khata.trusted_write', 'on', true);
$$;

create or replace function public.is_trusted_write()
returns boolean
language sql stable
as $$
  select coalesce(current_setting('khata.trusted_write', true), '') = 'on'
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile with the right role
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.users_profile (id, phone, role_id)
  values (
    new.id,
    new.phone,
    case when public.is_admin_phone(new.phone)
         then public.role_id_by_setting('ADMIN_ROLE_NAME')
         else public.role_id_by_setting('DEFAULT_ROLE_NAME') end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Promote/demote everyone when the admin phone list or role names change.
create or replace function public.sync_admin_roles()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin   uuid := public.role_id_by_setting('ADMIN_ROLE_NAME');
  v_default uuid := public.role_id_by_setting('DEFAULT_ROLE_NAME');
begin
  if v_admin is null then
    return;
  end if;
  perform public.allow_trusted_write();

  update public.users_profile
     set role_id = v_admin
   where public.is_admin_phone(phone)
     and role_id is distinct from v_admin;

  update public.users_profile
     set role_id = v_default
   where role_id = v_admin
     and not public.is_admin_phone(phone);
end;
$$;

create or replace function public.on_admin_settings_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.key = 'ADMIN_PHONES'
     and tg_op = 'UPDATE'
     and jsonb_array_length(coalesce(new.value, '[]'::jsonb)) = 0 then
    raise exception 'ADMIN_PHONES cannot be empty; keep at least one admin phone';
  end if;
  perform public.sync_admin_roles();
  return new;
end;
$$;

create trigger app_settings_admin_sync
  after insert or update on public.app_settings
  for each row
  when (new.key in ('ADMIN_PHONES', 'ADMIN_ROLE_NAME', 'DEFAULT_ROLE_NAME'))
  execute function public.on_admin_settings_change();

-- ---------------------------------------------------------------------------
-- Guards on columns users must not change for themselves
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- auth.uid() is null for service-role / SQL maintenance, which may change anything.
  if auth.uid() is not null and not public.is_trusted_write()
     and not public.has_permission('can_manage_users') then
    if new.role_id is distinct from old.role_id
       or new.phone is distinct from old.phone
       or new.shop_id is distinct from old.shop_id
       or new.is_test is distinct from old.is_test then
      raise exception 'not allowed to change role, phone, shop or test flag';
    end if;
  end if;
  return new;
end;
$$;

create trigger users_profile_guard before update on public.users_profile
  for each row execute function public.guard_profile_update();

create or replace function public.guard_shop_subscription()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_trusted_write()
     and not public.has_permission('can_manage_shops') then
    if tg_op = 'INSERT' then
      new.subscription_plan_id := null;
      new.subscription_expires_at := null;
    elsif new.subscription_plan_id is distinct from old.subscription_plan_id
       or new.subscription_expires_at is distinct from old.subscription_expires_at
       or new.owner_user_id is distinct from old.owner_user_id then
      raise exception 'not allowed to change subscription or owner';
    end if;
  end if;
  return new;
end;
$$;

create trigger shops_guard before insert or update on public.shops
  for each row execute function public.guard_shop_subscription();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.app_settings     enable row level security;
alter table public.roles            enable row level security;
alter table public.pricing_plans    enable row level security;
alter table public.shops            enable row level security;
alter table public.users_profile    enable row level security;
alter table public.stocks           enable row level security;
alter table public.vendors          enable row level security;
alter table public.vendor_purchases enable row level security;
alter table public.support_tickets  enable row level security;
alter table public.stock_reminders  enable row level security;

-- app_settings
create policy app_settings_read on public.app_settings for select using (
  visibility = 'public'
  or (visibility = 'authenticated' and auth.uid() is not null)
  or public.has_permission('can_manage_settings')
);
create policy app_settings_write on public.app_settings for all
  using (public.has_permission('can_manage_settings'))
  with check (public.has_permission('can_manage_settings'));

-- roles
create policy roles_read on public.roles for select using (auth.uid() is not null);
create policy roles_write on public.roles for all
  using (public.has_permission('can_manage_roles'))
  with check (public.has_permission('can_manage_roles'));

-- pricing_plans: active plans are public (pricing page)
create policy pricing_read on public.pricing_plans for select using (
  is_active or public.has_permission('can_manage_pricing')
);
create policy pricing_write on public.pricing_plans for all
  using (public.has_permission('can_manage_pricing'))
  with check (public.has_permission('can_manage_pricing'));

-- shops
create policy shops_read on public.shops for select using (
  public.has_permission('can_manage_shops') or id in (select public.my_shop_ids())
);
create policy shops_insert on public.shops for insert with check (
  public.has_permission('can_manage_shops')
  or (owner_user_id = auth.uid() and public.has_permission('can_manage_own_shop'))
);
create policy shops_update on public.shops for update
  using (public.has_permission('can_manage_shops') or owner_user_id = auth.uid())
  with check (public.has_permission('can_manage_shops') or owner_user_id = auth.uid());
create policy shops_delete on public.shops for delete using (public.has_permission('can_manage_shops'));

-- users_profile
create policy profile_read on public.users_profile for select using (
  id = auth.uid() or public.has_permission('can_manage_users')
);
create policy profile_update on public.users_profile for update
  using (id = auth.uid() or public.has_permission('can_manage_users'))
  with check (id = auth.uid() or public.has_permission('can_manage_users'));
create policy profile_delete on public.users_profile for delete using (public.has_permission('can_manage_users'));

-- shop-scoped tables
create policy stocks_all on public.stocks for all
  using (public.can_access_shop(shop_id)) with check (public.can_access_shop(shop_id));
create policy vendors_all on public.vendors for all
  using (public.can_access_shop(shop_id)) with check (public.can_access_shop(shop_id));
create policy vendor_purchases_all on public.vendor_purchases for all
  using (public.can_access_shop(shop_id)) with check (public.can_access_shop(shop_id));
create policy stock_reminders_all on public.stock_reminders for all
  using (public.can_access_shop(shop_id)) with check (public.can_access_shop(shop_id));

-- support_tickets
create policy tickets_read on public.support_tickets for select using (
  user_id = auth.uid() or public.has_permission('can_manage_support')
);
create policy tickets_insert on public.support_tickets for insert with check (
  user_id = auth.uid() and (shop_id is null or shop_id in (select public.my_shop_ids()))
);
create policy tickets_update on public.support_tickets for update
  using (public.has_permission('can_manage_support'))
  with check (public.has_permission('can_manage_support'));
create policy tickets_delete on public.support_tickets for delete using (public.has_permission('can_manage_support'));

-- Internal helpers are not part of the public API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_admin_roles() from public, anon, authenticated;
revoke execute on function public.on_admin_settings_change() from public, anon, authenticated;
revoke execute on function public.allow_trusted_write() from public, anon, authenticated;
