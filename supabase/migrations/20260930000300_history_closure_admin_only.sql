-- 1) crud_list range filters: {"created_at__gte": "...", "created_at__lt": "..."}.
-- 2) Shop closure: the owner requests it, the platform admin settles money and approves;
--    approval closes the shop end to end (store off, access off, open orders cancelled,
--    reserved stock released). Data is kept with a closed status.
-- 3) Customers see when a shop they use is closing or closed.
-- 4) Admin dashboard: closing/closed/paused states, plan info and payment history.
-- 5) The platform admin role no longer runs a shop of its own.

-- ---------------------------------------------------------------------------
-- 1) Range filters in crud_list
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
  v_op    text;
  v_dir   text;
  k       text;
  v       jsonb;
  v_out   jsonb;
begin
  perform public.crud_assert_table(p_table);

  for k, v in select * from jsonb_each(coalesce(p_filter, '{}'::jsonb)) loop
    v_col := k;
    v_op := '=';
    if k like '%\_\_gte' then v_col := left(k, -5); v_op := '>=';
    elsif k like '%\_\_lt' then v_col := left(k, -4); v_op := '<';
    elsif k like '%\_\_in' then v_col := left(k, -4); v_op := 'in';
    end if;
    if not (v_col = any (v_cols)) then
      raise exception 'unknown column %', v_col;
    end if;

    if v_op = 'in' then
      v_where := v_where || format(' and t.%I::text = any (%L::text[])', v_col,
        (select array_agg(x) from jsonb_array_elements_text(v) x));
    elsif jsonb_typeof(v) = 'null' then
      v_where := v_where || format(' and t.%I is null', v_col);
    elsif v_op = '=' then
      v_where := v_where || format(' and t.%I::text = %L', v_col, v #>> '{}');
    else
      v_where := v_where || format(' and t.%I %s %L', v_col, v_op, v #>> '{}');
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

-- ---------------------------------------------------------------------------
-- 2) Shop closure
-- ---------------------------------------------------------------------------
alter table public.shops add column if not exists closed_at timestamptz;

create table public.shop_closure_requests (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops (id) on delete cascade,
  requested_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason       text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  admin_note   text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid
);
create unique index shop_closure_one_pending on public.shop_closure_requests (shop_id) where status = 'pending';

alter table public.shop_closure_requests enable row level security;
create policy closure_read on public.shop_closure_requests for select using (
  public.has_permission('can_manage_shops') or shop_id in (select public.my_shop_ids())
);

create or replace function public.request_shop_closure(p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_shop uuid := (select id from public.shops where owner_user_id = auth.uid() and closed_at is null limit 1);
  v_row  public.shop_closure_requests;
begin
  if v_shop is null then raise exception 'not_found'; end if;
  insert into public.shop_closure_requests (shop_id, reason)
  values (v_shop, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into v_row;
  return to_jsonb(v_row);
exception
  when unique_violation then raise exception 'closure_already_requested';
end;
$$;

create or replace function public.withdraw_shop_closure()
returns void
language sql security definer
set search_path = public
as $$
  update public.shop_closure_requests
     set status = 'withdrawn', decided_at = now()
   where status = 'pending'
     and shop_id in (select id from public.shops where owner_user_id = auth.uid())
$$;

-- Approve: close the shop end to end. Reject: back to normal with a note.
create or replace function public.decide_shop_closure(p_request_id uuid, p_approve boolean, p_note text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_req   public.shop_closure_requests;
  v_order uuid;
begin
  if not public.has_permission('can_manage_shops') then raise exception 'permissionDenied'; end if;
  select * into v_req from public.shop_closure_requests where id = p_request_id and status = 'pending' for update;
  if v_req.id is null then raise exception 'not_found'; end if;

  update public.shop_closure_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = nullif(trim(coalesce(p_note, '')), ''), decided_at = now(), decided_by = auth.uid()
   where id = p_request_id;

  if not p_approve then
    return;
  end if;

  -- Open orders: release stock and cancel with a remark customers can read.
  for v_order in
    select id from public.orders where shop_id = v_req.shop_id and status in ('requested', 'accepted', 'packed', 'ready')
  loop
    perform public.release_order_stock(v_order);
    update public.orders set status = 'cancelled' where id = v_order;
    perform public.add_order_event(v_order, 'cancelled', public.setting('ORDER_TEXTS') ->> 'shop_closed', 'system');
  end loop;

  update public.shops
     set is_active = false, store_enabled = false, closed_at = now()
   where id = v_req.shop_id;
end;
$$;

-- Owner's view of their own closure state.
create or replace function public.my_shop_closure()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(r)
  from public.shop_closure_requests r
  where r.shop_id in (select public.my_shop_ids())
  order by r.created_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 3) Customers see shop state
-- ---------------------------------------------------------------------------
create or replace function public.shop_state(p_shop_id uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when s.closed_at is not null then 'closed'
    when exists (select 1 from public.shop_closure_requests r where r.shop_id = s.id and r.status = 'pending') then 'closing'
    when not s.is_active then 'paused'
    else 'open'
  end
  from public.shops s where s.id = p_shop_id
$$;

create or replace function public.my_shops()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug,
                                               'state', public.shop_state(s.id)) order by sc.joined_at desc), '[]'::jsonb)
  from public.shop_customers sc
  join public.shops s on s.id = sc.shop_id
  where sc.user_id = auth.uid()
$$;

create or replace function public.store_get(p_slug text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'shop', jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'store_enabled', s.store_enabled and s.is_active,
      'state', public.shop_state(s.id),
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

-- ---------------------------------------------------------------------------
-- 4) Admin dashboard with shop states, plans, payments and closure requests
-- ---------------------------------------------------------------------------
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
        'active', count(*) filter (where st = 'active'),
        'expired', count(*) filter (where st = 'expired'),
        'paused', count(*) filter (where st = 'paused'),
        'closing', count(*) filter (where st = 'closing'),
        'closed', count(*) filter (where st = 'closed'),
        'new_shops', count(*) filter (where created_at >= p_from and created_at < p_to),
        'revenue', (select coalesce(sum(amount), 0) from public.subscription_payments where paid_at >= p_from and paid_at < p_to),
        'payments', (select count(*) from public.subscription_payments where paid_at >= p_from and paid_at < p_to),
        'sales', (select coalesce(sum(total), 0) from public.orders where status = 'completed' and updated_at >= p_from and updated_at < p_to),
        'orders', (select count(*) from public.orders where created_at >= p_from and created_at < p_to),
        'customers', (select count(distinct user_id) from public.shop_customers)
      )
      from (
        select s.created_at,
               case
                 when s.closed_at is not null then 'closed'
                 when exists (select 1 from public.shop_closure_requests r where r.shop_id = s.id and r.status = 'pending') then 'closing'
                 when not s.is_active then 'paused'
                 when s.subscription_expires_at is not null and s.subscription_expires_at <= now() then 'expired'
                 else 'active'
               end as st
        from public.shops s
      ) x
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
    'closure_requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'shop_id', r.shop_id, 'shop', s.name, 'reason', r.reason,
                                          'created_at', r.created_at, 'owner_phone', up.phone,
                                          'owner_name', coalesce(up.display_name, up.username),
                                          'open_orders', (select count(*) from public.orders o where o.shop_id = s.id
                                                          and o.status in ('requested', 'accepted', 'packed', 'ready')),
                                          'paid_total', (select coalesce(sum(amount), 0) from public.subscription_payments sp where sp.shop_id = s.id),
                                          'valid_till', s.subscription_expires_at)
                       order by r.created_at)
      from public.shop_closure_requests r
      join public.shops s on s.id = r.shop_id
      left join public.users_profile up on up.id = s.owner_user_id
      where r.status = 'pending'
    ), '[]'::jsonb),
    'shops', coalesce((
      select jsonb_agg(row_to_json(t) order by t.created_at desc)
      from (
        select s.id, s.name, s.slug, s.is_active, s.closed_at, s.subscription_expires_at, s.created_at,
               public.shop_state(s.id) as state,
               p.name as plan, p.price as plan_price, up.phone as owner_phone,
               coalesce(up.display_name, up.username) as owner_name, up.avatar_url as owner_avatar,
               (select count(*) from public.shop_customers sc where sc.shop_id = s.id) as customers,
               (select count(*) from public.orders o where o.shop_id = s.id) as orders,
               (select coalesce(sum(total), 0) from public.orders o where o.shop_id = s.id and o.status = 'completed') as sales,
               (select max(created_at) from public.orders o where o.shop_id = s.id) as last_order_at,
               (select coalesce(sum(amount), 0) from public.subscription_payments sp where sp.shop_id = s.id) as paid_total,
               coalesce((select jsonb_agg(jsonb_build_object('paid_at', sp.paid_at, 'amount', sp.amount, 'plan', pp.name,
                                                             'valid_from', sp.valid_from, 'valid_until', sp.valid_until, 'note', sp.note)
                                          order by sp.paid_at desc)
                         from public.subscription_payments sp left join public.pricing_plans pp on pp.id = sp.plan_id
                         where sp.shop_id = s.id), '[]'::jsonb) as payments_list
        from public.shops s
        left join public.pricing_plans p on p.id = s.subscription_plan_id
        left join public.users_profile up on up.id = s.owner_user_id
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- Reactivating via the dashboard does not reopen a closed shop.
create or replace function public.set_shop_active(p_shop_id uuid, p_active boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.has_permission('can_manage_shops') then raise exception 'permissionDenied'; end if;
  if p_active and exists (select 1 from public.shops where id = p_shop_id and closed_at is not null) then
    raise exception 'shop_closed';
  end if;
  update public.shops set is_active = p_active where id = p_shop_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Platform admin role: admin screens only
-- ---------------------------------------------------------------------------
update public.roles
   set permissions = permissions - 'can_manage_own_shop' - 'can_order'
 where name = public.setting_text('ADMIN_ROLE_NAME');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.shop_state(uuid) from public, anon;
grant execute on function public.shop_state(uuid) to authenticated;
do $$
declare f text;
begin
  foreach f in array array['request_shop_closure(text)', 'withdraw_shop_closure()', 'decide_shop_closure(uuid, boolean, text)', 'my_shop_closure()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
