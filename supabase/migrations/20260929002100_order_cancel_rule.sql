-- A customer who has reported a payment can no longer cancel by themselves; the shop
-- handles it (refund or cancel) so money and stock stay consistent.
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
  if v_order.status not in ('requested', 'accepted')
     or v_order.amount_paid > 0
     or v_order.payment_status <> 'unpaid' then
    raise exception 'cannot_cancel';
  end if;
  if v_order.status = 'accepted' then perform public.release_order_stock(p_order_id); end if;
  update public.orders set status = 'cancelled' where id = p_order_id;
  perform public.add_order_event(p_order_id, 'cancelled', p_remark, 'customer');
end;
$$;
