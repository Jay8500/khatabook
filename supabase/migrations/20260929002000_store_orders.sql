-- Phase 3A: each shop gets a public store (link /s/<slug> or join code), its customers
-- place order requests, the shop accepts them with payment terms, stock is reserved on
-- accept and deducted on completion. Every step can carry a remark (order_events).

-- ---------------------------------------------------------------------------
-- Shop store settings
-- ---------------------------------------------------------------------------
create or replace function public.store_default(p_key text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select public.setting('STORE_DEFAULTS') -> p_key
$$;

alter table public.shops
  add column if not exists slug                    text,
  add column if not exists join_code               text,
  add column if not exists store_enabled           boolean not null default true,
  add column if not exists pickup_enabled          boolean not null default coalesce((public.store_default('pickup'))::text::boolean, true),
  add column if not exists delivery_enabled        boolean not null default coalesce((public.store_default('delivery'))::text::boolean, false),
  add column if not exists delivery_charge         numeric(12, 2) not null default 0,
  add column if not exists delivery_note           text,
  add column if not exists min_order_amount        numeric(12, 2) not null default 0,
  add column if not exists upi_id                  text,
  add column if not exists upi_name                text,
  add column if not exists default_payment_mode    text not null default coalesce(public.store_default('payment_mode') #>> '{}', 'full'),
  add column if not exists default_advance_percent numeric(5, 2) not null default coalesce((public.store_default('advance_percent') #>> '{}')::numeric, 0),
  add column if not exists address                 text,
  add column if not exists contact_phone           text,
  add column if not exists store_note              text,
  add column if not exists order_seq               integer not null default 0;

alter table public.shops
  add constraint shops_payment_mode_check check (default_payment_mode in ('full', 'advance', 'cod'));

create unique index if not exists shops_slug_key on public.shops (slug);
create unique index if not exists shops_join_code_key on public.shops (join_code);

create or replace function public.make_shop_slug(p_name text)
returns text
language plpgsql volatile
set search_path = public
as $$
declare
  v_base text := trim(both '-' from regexp_replace(lower(coalesce(p_name, 'shop')), '[^a-z0-9]+', '-', 'g'));
  v_slug text;
begin
  if v_base = '' then v_base := 'shop'; end if;
  v_slug := left(v_base, 40);
  while exists (select 1 from public.shops where slug = v_slug) loop
    v_slug := left(v_base, 40) || '-' || substr(md5(random()::text), 1, 4);
  end loop;
  return v_slug;
end;
$$;

create or replace function public.make_join_code()
returns text
language plpgsql volatile
set search_path = public
as $$
declare
  v_chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- no 0/O/1/I
  v_length int  := coalesce(public.setting_text('STORE_JOIN_CODE_LENGTH')::int, 6);
  v_code   text;
begin
  loop
    select string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
      into v_code
      from generate_series(1, v_length);
    exit when not exists (select 1 from public.shops where join_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.shops_fill_store_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.make_shop_slug(new.name);
  else
    new.slug := trim(both '-' from regexp_replace(lower(new.slug), '[^a-z0-9]+', '-', 'g'));
  end if;
  if new.join_code is null or new.join_code = '' then
    new.join_code := public.make_join_code();
  end if;
  return new;
end;
$$;

create trigger shops_store_fields before insert or update of slug, join_code on public.shops
  for each row execute function public.shops_fill_store_fields();

-- Existing shops get a slug and join code.
update public.shops set slug = public.make_shop_slug(name) where slug is null;
update public.shops set join_code = public.make_join_code() where join_code is null;

-- ---------------------------------------------------------------------------
-- Catalog fields on stock
-- ---------------------------------------------------------------------------
alter table public.stocks
  add column if not exists price         numeric(12, 2),
  add column if not exists category      text,
  add column if not exists description   text,
  add column if not exists image_url     text,
  add column if not exists show_in_store boolean not null default true,
  add column if not exists reserved_qty  numeric(12, 3) not null default 0;

alter table public.stocks add constraint stocks_reserved_check check (reserved_qty >= 0);

-- ---------------------------------------------------------------------------
-- Customers, orders
-- ---------------------------------------------------------------------------
create table public.shop_customers (
  id        uuid primary key default gen_random_uuid(),
  shop_id   uuid not null references public.shops (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  name      text,
  phone     text,
  address   text,
  joined_at timestamptz not null default now(),
  is_test   boolean not null default public.current_test_mode(),
  unique (shop_id, user_id)
);

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops (id) on delete cascade,
  customer_id       uuid not null references auth.users (id) on delete cascade,
  order_no          integer not null,
  status            text not null default 'requested'
                    check (status in ('requested', 'accepted', 'packed', 'ready', 'completed', 'rejected', 'cancelled')),
  fulfilment        text not null check (fulfilment in ('pickup', 'delivery')),
  delivery_address  text,
  customer_note     text,
  subtotal          numeric(12, 2) not null default 0,
  delivery_charge   numeric(12, 2) not null default 0,
  total             numeric(12, 2) not null default 0,
  payment_mode      text check (payment_mode in ('full', 'advance', 'cod')),
  amount_due_now    numeric(12, 2) not null default 0,
  amount_paid       numeric(12, 2) not null default 0,
  payment_status    text not null default 'unpaid'
                    check (payment_status in ('unpaid', 'pending_verification', 'partially_paid', 'paid')),
  payment_reference text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  is_test           boolean not null default public.current_test_mode(),
  unique (shop_id, order_no)
);
create index orders_shop_status_idx on public.orders (shop_id, status, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  stock_id      uuid references public.stocks (id) on delete set null,
  product_name  text not null,
  unit          text,
  image_url     text,
  price         numeric(12, 2) not null,
  qty_requested numeric(12, 3) not null check (qty_requested > 0),
  qty_accepted  numeric(12, 3)
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  status     text,
  remark     text,
  actor_id   uuid default auth.uid(),
  actor_role text not null check (actor_role in ('customer', 'shop', 'system')),
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Row level security (reads only; every write goes through the RPCs below)
-- ---------------------------------------------------------------------------
alter table public.shop_customers enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.order_events   enable row level security;

create policy shop_customers_read on public.shop_customers for select using (
  user_id = auth.uid() or public.can_access_shop(shop_id)
);
create policy orders_read on public.orders for select using (
  customer_id = auth.uid() or public.can_access_shop(shop_id)
);
create policy order_items_read on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id
          and (o.customer_id = auth.uid() or public.can_access_shop(o.shop_id)))
);
create policy order_events_read on public.order_events for select using (
  exists (select 1 from public.orders o where o.id = order_id
          and (o.customer_id = auth.uid() or public.can_access_shop(o.shop_id)))
);

create or replace function public.crud_assert_table(p_table text)
returns void
language plpgsql immutable
set search_path = public
as $$
begin
  if p_table is null or not (p_table = any (array[
    'app_settings', 'roles', 'pricing_plans', 'shops', 'users_profile',
    'stocks', 'vendors', 'vendor_purchases', 'support_tickets', 'stock_reminders',
    'login_codes', 'shop_customers', 'orders', 'order_items', 'order_events'
  ])) then
    raise exception 'table % is not available', p_table;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signup: people coming from a shop link become customers
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
    case
      when public.is_admin_phone(new.phone) then public.role_id_by_setting('ADMIN_ROLE_NAME')
      when new.raw_user_meta_data ->> 'signup_as' = 'customer' then public.role_id_by_setting('CUSTOMER_ROLE_NAME')
      else public.role_id_by_setting('DEFAULT_ROLE_NAME')
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Only people who may run a shop create one during onboarding.
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
    raise exception 'required';
  end if;

  perform public.allow_trusted_write();

  update public.users_profile set username = trim(p_username) where id = v_uid;
  update public.shop_customers set name = trim(p_username) where user_id = v_uid and name is null;

  if coalesce(trim(p_shop_name), '') <> ''
     and public.has_permission('can_manage_own_shop')
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

  perform public.end_trusted_write();
  return public.get_my_context();
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Public store (no login needed to browse)
-- ---------------------------------------------------------------------------
create or replace function public.store_get(p_slug text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'shop', jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'store_enabled', s.store_enabled,
      'pickup_enabled', s.pickup_enabled, 'delivery_enabled', s.delivery_enabled,
      'delivery_charge', s.delivery_charge, 'delivery_note', s.delivery_note,
      'min_order_amount', s.min_order_amount, 'store_note', s.store_note,
      'address', s.address, 'contact_phone', s.contact_phone
    ),
    'items', case when s.store_enabled then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', st.id, 'name', st.product_name, 'unit', st.unit, 'price', st.price,
               'category', st.category, 'description', st.description, 'image_url', st.image_url,
               'available', greatest(st.qty - st.reserved_qty, 0)
             ) order by st.category nulls last, st.product_name)
      from public.stocks st
      where st.shop_id = s.id and st.show_in_store and st.price is not null
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.shops s
  where s.slug = lower(p_slug)
$$;

-- Join by the shop's code or the owner's / shop contact phone -> the store slug.
create or replace function public.store_find(p_query text)
returns text
language sql stable security definer
set search_path = public
as $$
  select s.slug
  from public.shops s
  left join public.users_profile up on up.id = s.owner_user_id
  where s.store_enabled
    and (
      upper(s.join_code) = upper(trim(p_query))
      or (length(public.normalize_phone(p_query)) >= 10
          and (right(public.normalize_phone(up.phone), 10) = right(public.normalize_phone(p_query), 10)
               or right(public.normalize_phone(s.contact_phone), 10) = right(public.normalize_phone(p_query), 10)))
    )
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Customer actions
-- ---------------------------------------------------------------------------
create or replace function public.store_join(p_shop_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_row public.shop_customers;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.shop_customers (shop_id, user_id, name, phone)
  select p_shop_id, up.id, up.username, up.phone from public.users_profile up where up.id = auth.uid()
  on conflict (shop_id, user_id) do update set name = coalesce(public.shop_customers.name, excluded.name)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.my_shops()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug) order by sc.joined_at desc), '[]'::jsonb)
  from public.shop_customers sc
  join public.shops s on s.id = sc.shop_id
  where sc.user_id = auth.uid()
$$;

create or replace function public.add_order_event(p_order_id uuid, p_status text, p_remark text, p_role text)
returns void
language sql
set search_path = public
as $$
  insert into public.order_events (order_id, status, remark, actor_role)
  values (p_order_id, p_status, nullif(trim(coalesce(p_remark, '')), ''), p_role)
$$;

-- p_items: [{"stock_id": uuid, "qty": number}, ...]. Prices always come from stock.
create or replace function public.order_place(
  p_shop_id    uuid,
  p_items      jsonb,
  p_fulfilment text,
  p_address    text,
  p_note       text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_shop  public.shops;
  v_order uuid;
  v_no    integer;
  v_sub   numeric := 0;
  v_fee   numeric := 0;
  v_item  record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.has_permission('can_order') then raise exception 'permissionDenied'; end if;

  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null or not v_shop.store_enabled then raise exception 'store_closed'; end if;
  if p_fulfilment = 'pickup' and not v_shop.pickup_enabled then raise exception 'fulfilment_unavailable'; end if;
  if p_fulfilment = 'delivery' and not v_shop.delivery_enabled then raise exception 'fulfilment_unavailable'; end if;
  if p_fulfilment not in ('pickup', 'delivery') then raise exception 'fulfilment_unavailable'; end if;
  if p_fulfilment = 'delivery' and coalesce(trim(p_address), '') = '' then raise exception 'address_required'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'cart_empty'; end if;

  -- Lines joined to live stock; unknown, hidden or unpriced items are refused.
  -- Same item twice in the cart counts once, with the quantities added up.
  for v_item in
    select l.stock_id, l.qty, st.id as found,
           st.product_name, st.show_in_store, st.price, greatest(st.qty - st.reserved_qty, 0) as available
    from (
      select (i ->> 'stock_id')::uuid as stock_id, sum((i ->> 'qty')::numeric) as qty
      from jsonb_array_elements(p_items) i
      group by 1
    ) l
    left join public.stocks st on st.id = l.stock_id and st.shop_id = p_shop_id
  loop
    if v_item.found is null or not v_item.show_in_store or v_item.price is null then
      raise exception 'item_unavailable';
    end if;
    if v_item.qty is null or v_item.qty <= 0 then raise exception 'invalid_quantity'; end if;
    if v_item.qty > v_item.available then
      raise exception 'not_enough_stock' using detail = v_item.product_name;
    end if;
    v_sub := v_sub + v_item.qty * v_item.price;
  end loop;

  if v_sub < v_shop.min_order_amount then raise exception 'below_min_order'; end if;
  if p_fulfilment = 'delivery' then v_fee := v_shop.delivery_charge; end if;

  update public.shops set order_seq = order_seq + 1 where id = p_shop_id returning order_seq into v_no;

  insert into public.orders (shop_id, customer_id, order_no, fulfilment, delivery_address, customer_note,
                             subtotal, delivery_charge, total)
  values (p_shop_id, v_uid, v_no, p_fulfilment,
          case when p_fulfilment = 'delivery' then trim(p_address) end,
          nullif(trim(coalesce(p_note, '')), ''), v_sub, v_fee, v_sub + v_fee)
  returning id into v_order;

  insert into public.order_items (order_id, stock_id, product_name, unit, image_url, price, qty_requested)
  select v_order, st.id, st.product_name, st.unit, st.image_url, st.price, l.qty
  from (
    select (i ->> 'stock_id')::uuid as stock_id, sum((i ->> 'qty')::numeric) as qty
    from jsonb_array_elements(p_items) i
    group by 1
  ) l
  join public.stocks st on st.id = l.stock_id;

  perform public.store_join(p_shop_id);
  if p_fulfilment = 'delivery' then
    update public.shop_customers set address = trim(p_address) where shop_id = p_shop_id and user_id = v_uid;
  end if;
  perform public.add_order_event(v_order, 'requested', p_note, 'customer');
  return v_order;
end;
$$;

-- One order with its items, timeline, shop payment details and customer contact.
create or replace function public.order_get(p_order_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'order', to_jsonb(o),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.product_name) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.order_events e where e.order_id = o.id), '[]'::jsonb),
    'shop', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'upi_id', s.upi_id,
                               'upi_name', s.upi_name, 'contact_phone', s.contact_phone, 'address', s.address,
                               'default_payment_mode', s.default_payment_mode,
                               'default_advance_percent', s.default_advance_percent),
    'customer', jsonb_build_object('name', coalesce(sc.name, up.username), 'phone', up.phone),
    'viewer', case when o.customer_id = auth.uid() and not public.can_access_shop(o.shop_id) then 'customer' else 'shop' end
  )
  from public.orders o
  join public.shops s on s.id = o.shop_id
  left join public.users_profile up on up.id = o.customer_id
  left join public.shop_customers sc on sc.shop_id = o.shop_id and sc.user_id = o.customer_id
  where o.id = p_order_id
    and (o.customer_id = auth.uid() or public.can_access_shop(o.shop_id))
$$;

create or replace function public.order_cancel(p_order_id uuid, p_remark text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if v_order.id is null then raise exception 'not_found'; end if;
  if v_order.status not in ('requested', 'accepted') or v_order.amount_paid > 0 then
    raise exception 'cannot_cancel';
  end if;
  if v_order.status = 'accepted' then perform public.release_order_stock(p_order_id); end if;
  update public.orders set status = 'cancelled' where id = p_order_id;
  perform public.add_order_event(p_order_id, 'cancelled', p_remark, 'customer');
end;
$$;

create or replace function public.order_submit_payment(p_order_id uuid, p_amount numeric, p_reference text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.orders
     set payment_status = 'pending_verification', payment_reference = nullif(trim(coalesce(p_reference, '')), '')
   where id = p_order_id and customer_id = auth.uid() and status in ('accepted', 'packed', 'ready');
  if not found then raise exception 'not_found'; end if;
  perform public.add_order_event(
    p_order_id, null,
    format('%s %s%s', public.setting('ORDER_TEXTS') ->> 'paid_by_customer', p_amount,
           case when coalesce(trim(p_reference), '') <> '' then ' · ' || trim(p_reference) else '' end),
    'customer');
end;
$$;

create or replace function public.order_remark(p_order_id uuid, p_remark text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if coalesce(trim(p_remark), '') = '' then raise exception 'required'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then raise exception 'not_found'; end if;
  if public.can_access_shop(v_order.shop_id) then
    perform public.add_order_event(p_order_id, null, p_remark, 'shop');
  elsif v_order.customer_id = auth.uid() then
    perform public.add_order_event(p_order_id, null, p_remark, 'customer');
  else
    raise exception 'not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shop actions
-- ---------------------------------------------------------------------------
create or replace function public.release_order_stock(p_order_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.stocks st
     set reserved_qty = greatest(st.reserved_qty - i.qty_accepted, 0)
    from public.order_items i
   where i.order_id = p_order_id and i.stock_id = st.id and coalesce(i.qty_accepted, 0) > 0
$$;

-- p_items: [{"id": order_item_id, "qty": accepted qty}] (missing lines keep the requested qty)
create or replace function public.order_accept(
  p_order_id      uuid,
  p_items         jsonb,
  p_payment_mode  text,
  p_advance       numeric,
  p_remark        text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_line  record;
  v_sub   numeric := 0;
  v_total numeric;
  v_due   numeric;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or not public.can_access_shop(v_order.shop_id) then raise exception 'not_found'; end if;
  if v_order.status <> 'requested' then raise exception 'invalid_status'; end if;
  if p_payment_mode not in ('full', 'advance', 'cod') then raise exception 'invalid_payment_mode'; end if;

  for v_line in
    select i.id, i.stock_id, i.product_name, i.price, i.qty_requested,
           least(greatest(coalesce((x ->> 'qty')::numeric, i.qty_requested), 0), i.qty_requested) as qty
    from public.order_items i
    left join jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x on (x ->> 'id')::uuid = i.id
    where i.order_id = p_order_id
  loop
    if v_line.qty > 0 then
      perform 1 from public.stocks where id = v_line.stock_id
        and qty - reserved_qty >= v_line.qty for update;
      if not found then
        raise exception 'not_enough_stock' using detail = v_line.product_name;
      end if;
      update public.stocks set reserved_qty = reserved_qty + v_line.qty where id = v_line.stock_id;
    end if;
    update public.order_items set qty_accepted = v_line.qty where id = v_line.id;
    v_sub := v_sub + v_line.qty * v_line.price;
  end loop;

  if v_sub = 0 then raise exception 'nothing_accepted'; end if;
  v_total := v_sub + v_order.delivery_charge;
  v_due := case p_payment_mode
             when 'full' then v_total
             when 'advance' then least(greatest(coalesce(p_advance, 0), 0), v_total)
             else 0 end;

  update public.orders
     set status = 'accepted', subtotal = v_sub, total = v_total, payment_mode = p_payment_mode, amount_due_now = v_due
   where id = p_order_id;
  perform public.add_order_event(p_order_id, 'accepted', p_remark, 'shop');
end;
$$;

create or replace function public.order_reject(p_order_id uuid, p_remark text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.orders set status = 'rejected'
   where id = p_order_id and status = 'requested' and public.can_access_shop(shop_id);
  if not found then raise exception 'invalid_status'; end if;
  perform public.add_order_event(p_order_id, 'rejected', p_remark, 'shop');
end;
$$;

-- accepted -> packed -> ready -> completed; accepted/packed/ready -> cancelled.
create or replace function public.order_set_status(p_order_id uuid, p_status text, p_remark text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_ok    boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or not public.can_access_shop(v_order.shop_id) then raise exception 'not_found'; end if;

  v_ok := (v_order.status, p_status) in (
    ('accepted', 'packed'), ('packed', 'ready'), ('accepted', 'ready'), ('ready', 'completed'),
    ('accepted', 'cancelled'), ('packed', 'cancelled'), ('ready', 'cancelled'));
  if not v_ok then raise exception 'invalid_status'; end if;

  if p_status = 'completed' then
    update public.stocks st
       set qty = st.qty - i.qty_accepted,
           reserved_qty = greatest(st.reserved_qty - i.qty_accepted, 0)
      from public.order_items i
     where i.order_id = p_order_id and i.stock_id = st.id and coalesce(i.qty_accepted, 0) > 0;
  elsif p_status = 'cancelled' then
    perform public.release_order_stock(p_order_id);
  end if;

  update public.orders set status = p_status where id = p_order_id;
  perform public.add_order_event(p_order_id, p_status, p_remark, 'shop');
end;
$$;

create or replace function public.order_confirm_payment(p_order_id uuid, p_amount numeric, p_remark text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_paid  numeric;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or not public.can_access_shop(v_order.shop_id) then raise exception 'not_found'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_amount'; end if;

  v_paid := v_order.amount_paid + p_amount;
  update public.orders
     set amount_paid = v_paid,
         payment_status = case when v_paid >= v_order.total then 'paid' else 'partially_paid' end
   where id = p_order_id;
  perform public.add_order_event(
    p_order_id, null,
    trim(format('%s %s. %s', public.setting('ORDER_TEXTS') ->> 'payment_received', p_amount, coalesce(p_remark, ''))),
    'shop');
end;
$$;

-- Counts per status for the Orders tab badge.
create or replace function public.shop_order_counts()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
  from (
    select o.status, count(*) as n
    from public.orders o
    where o.shop_id in (select public.my_shop_ids())
    group by o.status
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Product photos: public bucket, writes limited to the shop's folder
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy products_insert on storage.objects for insert with check (
  bucket_id = 'products' and public.can_access_shop(((storage.foldername(name))[1])::uuid)
);
create policy products_update on storage.objects for update
  using (bucket_id = 'products' and public.can_access_shop(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'products' and public.can_access_shop(((storage.foldername(name))[1])::uuid));
create policy products_delete on storage.objects for delete using (
  bucket_id = 'products' and public.can_access_shop(((storage.foldername(name))[1])::uuid)
);
create policy products_read_own on storage.objects for select using (
  bucket_id = 'products' and public.can_access_shop(((storage.foldername(name))[1])::uuid)
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.store_default(text) from public, anon, authenticated;
revoke execute on function public.make_shop_slug(text) from public, anon, authenticated;
revoke execute on function public.make_join_code() from public, anon, authenticated;
revoke execute on function public.add_order_event(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.release_order_stock(uuid) from public, anon, authenticated;

grant execute on function public.store_get(text) to anon, authenticated;
grant execute on function public.store_find(text) to anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'store_join(uuid)', 'my_shops()', 'order_place(uuid, jsonb, text, text, text)', 'order_get(uuid)',
    'order_cancel(uuid, text)', 'order_submit_payment(uuid, numeric, text)', 'order_remark(uuid, text)',
    'order_accept(uuid, jsonb, text, numeric, text)', 'order_reject(uuid, text)',
    'order_set_status(uuid, text, text)', 'order_confirm_payment(uuid, numeric, text)', 'shop_order_counts()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Admins and shop owners may also order from other shops.
update public.roles
   set permissions = permissions || '{"can_order": true}'::jsonb
 where name in (public.setting_text('ADMIN_ROLE_NAME'), public.setting_text('DEFAULT_ROLE_NAME'));
