-- 1) One stock row per product name in a shop (case/space-insensitive).
-- 2) Purchases update stock: each bill line adds to the matching product or creates it.
-- 3) Platform admin: shops can be deactivated, subscription payments recorded (revenue),
--    and a dashboard summarises shops, revenue and shop sales for any period.
-- 4) crud_list accepts several sort columns ("category,product_name").

-- ---------------------------------------------------------------------------
-- 1) Unique product names per shop
-- ---------------------------------------------------------------------------
create unique index if not exists stocks_shop_name_key
  on public.stocks (shop_id, lower(trim(product_name)));

-- ---------------------------------------------------------------------------
-- 2) Purchases -> stock
-- ---------------------------------------------------------------------------
alter table public.vendor_purchases
  add column if not exists stock_applied boolean not null default false;

-- items: [{ "name", "qty", "rate", "unit"?, "category"? }]
create or replace function public.apply_purchase_to_stock()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_line  jsonb;
  v_name  text;
  v_qty   numeric;
begin
  if new.stock_applied then
    return new;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    v_name := trim(coalesce(v_line ->> 'name', ''));
    v_qty := coalesce((v_line ->> 'qty')::numeric, 0);
    continue when v_name = '' or v_qty <= 0;

    update public.stocks
       set qty = qty + v_qty,
           unit = coalesce(unit, nullif(v_line ->> 'unit', '')),
           category = coalesce(category, nullif(v_line ->> 'category', ''))
     where shop_id = new.shop_id and lower(trim(product_name)) = lower(v_name);

    if not found then
      insert into public.stocks (shop_id, product_name, qty, unit, category, show_in_store, is_test)
      values (new.shop_id, v_name, v_qty, nullif(v_line ->> 'unit', ''), nullif(v_line ->> 'category', ''),
              false, new.is_test);
    end if;
  end loop;

  update public.vendor_purchases set stock_applied = true where id = new.id;
  return new;
end;
$$;

create trigger vendor_purchases_apply_stock
  after insert on public.vendor_purchases
  for each row execute function public.apply_purchase_to_stock();

-- Deleting a purchase takes its quantities back out (never below zero).
create or replace function public.revert_purchase_stock()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_line jsonb;
begin
  if not old.stock_applied then
    return old;
  end if;
  for v_line in select * from jsonb_array_elements(coalesce(old.items, '[]'::jsonb)) loop
    update public.stocks
       set qty = greatest(qty - coalesce((v_line ->> 'qty')::numeric, 0), 0)
     where shop_id = old.shop_id and lower(trim(product_name)) = lower(trim(coalesce(v_line ->> 'name', '')));
  end loop;
  return old;
end;
$$;

create trigger vendor_purchases_revert_stock
  after delete on public.vendor_purchases
  for each row execute function public.revert_purchase_stock();

revoke execute on function public.apply_purchase_to_stock() from public, anon, authenticated;
revoke execute on function public.revert_purchase_stock() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Shop activation, subscription payments, admin dashboard
-- ---------------------------------------------------------------------------
alter table public.shops add column if not exists is_active boolean not null default true;

-- Deactivated shops: owner/staff lose access (admins keep it); the store is closed.
create or replace function public.can_access_shop(p_shop_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.has_permission('can_manage_shops')
      or (public.has_permission('can_manage_own_shop')
          and p_shop_id in (select public.my_shop_ids())
          and coalesce((select is_active from public.shops where id = p_shop_id), false))
$$;

create or replace function public.store_get(p_slug text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'shop', jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'store_enabled', s.store_enabled and s.is_active,
      'pickup_enabled', s.pickup_enabled, 'delivery_enabled', s.delivery_enabled,
      'delivery_charge', s.delivery_charge, 'delivery_note', s.delivery_note,
      'min_order_amount', s.min_order_amount, 'store_note', s.store_note,
      'address', s.address, 'contact_phone', s.contact_phone
    ),
    'items', case when s.store_enabled and s.is_active then coalesce((
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

create table public.subscription_payments (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops (id) on delete cascade,
  plan_id      uuid references public.pricing_plans (id) on delete set null,
  amount       numeric(12, 2) not null check (amount >= 0),
  paid_at      timestamptz not null default now(),
  valid_from   timestamptz not null,
  valid_until  timestamptz not null,
  note         text,
  recorded_by  uuid default auth.uid(),
  is_test      boolean not null default public.current_test_mode(),
  created_at   timestamptz not null default now()
);
create index subscription_payments_paid_idx on public.subscription_payments (paid_at);

alter table public.subscription_payments enable row level security;
create policy subscription_payments_read on public.subscription_payments for select using (
  public.has_permission('can_manage_shops') or shop_id in (select public.my_shop_ids())
);

-- Records a plan payment and extends the shop from its current expiry (or today).
create or replace function public.record_subscription_payment(
  p_shop_id uuid, p_plan_id uuid, p_amount numeric, p_note text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_plan  public.pricing_plans;
  v_from  timestamptz;
  v_until timestamptz;
  v_row   public.subscription_payments;
begin
  if not public.has_permission('can_manage_shops') then raise exception 'permissionDenied'; end if;
  select * into v_plan from public.pricing_plans where id = p_plan_id;
  if v_plan.id is null then raise exception 'not_found'; end if;

  select greatest(coalesce(subscription_expires_at, now()), now()) into v_from from public.shops where id = p_shop_id;
  if v_from is null then raise exception 'not_found'; end if;
  v_until := v_from + make_interval(days => v_plan.duration_days);

  insert into public.subscription_payments (shop_id, plan_id, amount, valid_from, valid_until, note)
  values (p_shop_id, p_plan_id, coalesce(p_amount, v_plan.price), v_from, v_until, nullif(trim(coalesce(p_note, '')), ''))
  returning * into v_row;

  update public.shops
     set subscription_plan_id = p_plan_id, subscription_expires_at = v_until, is_active = true
   where id = p_shop_id;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_shop_active(p_shop_id uuid, p_active boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.has_permission('can_manage_shops') then raise exception 'permissionDenied'; end if;
  update public.shops set is_active = p_active where id = p_shop_id;
end;
$$;

-- Admin dashboard for [p_from, p_to): totals, per-shop rows, and a series per p_bucket
-- ('day' | 'week' | 'month' | 'year').
create or replace function public.admin_dashboard(p_from timestamptz, p_to timestamptz, p_bucket text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_bucket text := case when p_bucket in ('day', 'week', 'month', 'year') then p_bucket else 'day' end;
begin
  if not public.has_permission('can_manage_shops') then raise exception 'permissionDenied'; end if;

  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'shops', count(*),
        'active', count(*) filter (where s.is_active and (s.subscription_expires_at is null or s.subscription_expires_at > now())),
        'expired', count(*) filter (where s.is_active and s.subscription_expires_at <= now()),
        'deactivated', count(*) filter (where not s.is_active),
        'new_shops', count(*) filter (where s.created_at >= p_from and s.created_at < p_to),
        'revenue', (select coalesce(sum(amount), 0) from public.subscription_payments where paid_at >= p_from and paid_at < p_to),
        'payments', (select count(*) from public.subscription_payments where paid_at >= p_from and paid_at < p_to),
        'sales', (select coalesce(sum(total), 0) from public.orders where status = 'completed' and updated_at >= p_from and updated_at < p_to),
        'orders', (select count(*) from public.orders where created_at >= p_from and created_at < p_to),
        'customers', (select count(distinct user_id) from public.shop_customers)
      )
      from public.shops s
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', b, 'revenue', revenue, 'sales', sales) order by b)
      from (
        select b, sum(revenue) as revenue, sum(sales) as sales
        from (
          select date_trunc(v_bucket, paid_at) as b, amount as revenue, 0::numeric as sales
          from public.subscription_payments where paid_at >= p_from and paid_at < p_to
          union all
          select date_trunc(v_bucket, updated_at), 0, total
          from public.orders where status = 'completed' and updated_at >= p_from and updated_at < p_to
        ) x
        group by b
      ) y
    ), '[]'::jsonb),
    'shops', coalesce((
      select jsonb_agg(row_to_json(t) order by t.created_at desc)
      from (
        select s.id, s.name, s.slug, s.is_active, s.subscription_expires_at, s.created_at,
               p.name as plan, up.phone as owner_phone,
               coalesce(up.display_name, up.username) as owner_name, up.avatar_url as owner_avatar,
               (select count(*) from public.shop_customers sc where sc.shop_id = s.id) as customers,
               (select count(*) from public.orders o where o.shop_id = s.id) as orders,
               (select coalesce(sum(total), 0) from public.orders o where o.shop_id = s.id and o.status = 'completed') as sales,
               (select max(created_at) from public.orders o where o.shop_id = s.id) as last_order_at,
               (select coalesce(sum(amount), 0) from public.subscription_payments sp where sp.shop_id = s.id) as paid_total
        from public.shops s
        left join public.pricing_plans p on p.id = s.subscription_plan_id
        left join public.users_profile up on up.id = s.owner_user_id
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'record_subscription_payment(uuid, uuid, numeric, text)',
    'set_shop_active(uuid, boolean)',
    'admin_dashboard(timestamptz, timestamptz, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) crud_list: "col1,col2.desc" ordering
-- ---------------------------------------------------------------------------
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
  v_part  text;
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
    foreach v_part in array string_to_array(p_order, ',') loop
      v_col := split_part(trim(v_part), '.', 1);
      v_dir := case when split_part(trim(v_part), '.', 2) = 'desc' then 'desc nulls last' else 'asc nulls last' end;
      if not (v_col = any (v_cols)) then
        raise exception 'unknown column %', v_col;
      end if;
      v_order := v_order || case when v_order = '' then ' order by ' else ', ' end || format('t.%I %s', v_col, v_dir);
    end loop;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(s)), ''[]''::jsonb) from (select t.* from public.%I t where true%s%s limit %s) s',
    p_table, v_where, v_order, least(greatest(coalesce(p_limit, 500), 1), 5000)
  ) into v_out;
  return v_out;
end;
$$;
