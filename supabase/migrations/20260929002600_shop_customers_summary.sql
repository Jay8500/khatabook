-- Shop owner's customer list: name, phone, photo and order totals for one shop.
-- users_profile is not readable by shop owners, so this runs as definer after checking
-- that the caller can access the shop.
create or replace function public.shop_customers_summary(p_shop_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.can_access_shop(p_shop_id) then
    raise exception 'not_found';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(c) order by c.last_order_at desc nulls last, c.joined_at desc)
    from (
      select
        sc.user_id,
        coalesce(sc.name, up.display_name, up.username) as name,
        coalesce(up.phone, sc.phone) as phone,
        up.avatar_url,
        sc.joined_at,
        count(o.id) filter (where o.status not in ('rejected', 'cancelled')) as orders,
        coalesce(sum(o.amount_paid), 0) as paid,
        coalesce(sum(o.total) filter (where o.status = 'completed'), 0) as bought,
        max(o.created_at) as last_order_at
      from public.shop_customers sc
      left join public.users_profile up on up.id = sc.user_id
      left join public.orders o on o.shop_id = sc.shop_id and o.customer_id = sc.user_id
      where sc.shop_id = p_shop_id
      group by sc.user_id, sc.name, up.display_name, up.username, up.phone, sc.phone, up.avatar_url, sc.joined_at
    ) c
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.shop_customers_summary(uuid) from public, anon;
grant execute on function public.shop_customers_summary(uuid) to authenticated;
