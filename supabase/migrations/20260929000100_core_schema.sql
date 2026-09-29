-- Core schema. Every business value (roles, prices, thresholds, texts) lives in rows,
-- never in code. Tables carry is_test, defaulted from app_settings IS_TEST_MODE.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  -- who receives it through config-loader: everyone, signed-in users, or settings admins
  visibility  text not null default 'authenticated'
              check (visibility in ('public', 'authenticated', 'admin')),
  is_test     boolean not null default false,
  updated_at  timestamptz not null default now()
);

create or replace function public.setting(p_key text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function public.setting_text(p_key text)
returns text
language sql stable
set search_path = public
as $$
  select public.setting(p_key) #>> '{}'
$$;

create or replace function public.current_test_mode()
returns boolean
language sql stable
set search_path = public
as $$
  select coalesce(public.setting_text('IS_TEST_MODE')::boolean, false)
$$;

create or replace function public.default_low_stock_threshold()
returns numeric
language sql stable
set search_path = public
as $$
  select public.setting_text('LOW_STOCK_DEFAULT_THRESHOLD')::numeric
$$;

-- ---------------------------------------------------------------------------
-- Roles, plans, shops, profiles
-- ---------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  permissions jsonb not null default '{}'::jsonb,
  is_test     boolean not null default public.current_test_mode(),
  created_at  timestamptz not null default now()
);

create table public.pricing_plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  price         numeric(12, 2) not null default 0 check (price >= 0),
  duration_days integer not null check (duration_days > 0),
  features      jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  is_test       boolean not null default public.current_test_mode(),
  created_at    timestamptz not null default now()
);

create table public.shops (
  id                      uuid primary key default gen_random_uuid(),
  owner_user_id           uuid not null references auth.users (id) on delete cascade,
  name                    text not null,
  subscription_plan_id    uuid references public.pricing_plans (id) on delete set null,
  subscription_expires_at timestamptz,
  is_test                 boolean not null default public.current_test_mode(),
  created_at              timestamptz not null default now()
);
create index shops_owner_idx on public.shops (owner_user_id);

create table public.users_profile (
  id          uuid primary key references auth.users (id) on delete cascade,
  phone       text,
  username    text,
  role_id     uuid references public.roles (id) on delete set null,
  shop_id     uuid references public.shops (id) on delete set null,
  preferences jsonb not null default '{}'::jsonb,
  is_test     boolean not null default public.current_test_mode(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index users_profile_username_key on public.users_profile (lower(username));
create index users_profile_phone_idx on public.users_profile (phone);

-- ---------------------------------------------------------------------------
-- Shop data
-- ---------------------------------------------------------------------------
create table public.stocks (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references public.shops (id) on delete cascade,
  product_name        text not null,
  qty                 numeric(12, 3) not null default 0,
  unit                text,
  low_stock_threshold numeric(12, 3) default public.default_low_stock_threshold(),
  is_test             boolean not null default public.current_test_mode(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index stocks_shop_idx on public.stocks (shop_id);

create table public.vendors (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops (id) on delete cascade,
  name       text not null,
  phone      text,
  location   text,
  is_test    boolean not null default public.current_test_mode(),
  created_at timestamptz not null default now()
);
create index vendors_shop_idx on public.vendors (shop_id);

create table public.vendor_purchases (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references public.shops (id) on delete cascade,
  vendor_id      uuid references public.vendors (id) on delete set null,
  items          jsonb not null default '[]'::jsonb,
  total_price    numeric(12, 2) not null default 0,
  bill_photo_url text,
  scanned_data   jsonb,
  purchase_date  date not null default current_date,
  is_test        boolean not null default public.current_test_mode(),
  created_at     timestamptz not null default now()
);
create index vendor_purchases_shop_idx on public.vendor_purchases (shop_id, purchase_date desc);

create table public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid references public.shops (id) on delete set null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  issue_type  text not null,
  description text,
  status      text not null default (public.setting('TICKET_STATUSES') ->> 0),
  is_test     boolean not null default public.current_test_mode(),
  created_at  timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets (user_id);

create table public.stock_reminders (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops (id) on delete cascade,
  stock_id      uuid not null references public.stocks (id) on delete cascade,
  message       text not null,
  qty           numeric(12, 3),
  threshold     numeric(12, 3),
  reminder_date date not null default current_date,
  is_read       boolean not null default false,
  is_test       boolean not null default public.current_test_mode(),
  created_at    timestamptz not null default now(),
  unique (stock_id, reminder_date)
);
create index stock_reminders_shop_idx on public.stock_reminders (shop_id, reminder_date desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();
create trigger users_profile_touch before update on public.users_profile
  for each row execute function public.touch_updated_at();
create trigger stocks_touch before update on public.stocks
  for each row execute function public.touch_updated_at();
