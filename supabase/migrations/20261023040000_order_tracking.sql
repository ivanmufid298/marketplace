-- The tracking number (nomor resi) of a paid order.
--
-- When the admin hands a paid order to the courier they enter the courier's tracking number on the order. The buyer sees it with the
-- order and is told (a notification), and the order's history records who entered it. Like every other order action this is a
-- function that checks the caller itself and writes the order, its history and the notification in one transaction.
--
--   set_tracking_number   a paid order that is neither cancelled nor received gets (or changes) its tracking number
--
-- Errors are short codes, like the other order functions: forbidden, order_not_found, not_shippable, invalid_tracking.
--
-- The first number is "shipped" in the history and tells the buyer; a different number later is "tracking_updated" and tells the buyer
-- again that it was corrected; the same number again changes nothing.
--
-- Safe to run twice.

alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists shipped_at timestamptz;

-- Letters, digits and dashes, 5 to 40 characters; and a number is always shipped at some time (and the other way round).
alter table public.orders drop constraint if exists orders_tracking_number_format;
alter table public.orders add constraint orders_tracking_number_format check (tracking_number is null or tracking_number ~ '^[A-Za-z0-9-]{5,40}$');
alter table public.orders drop constraint if exists orders_tracking_shipped_together;
alter table public.orders add constraint orders_tracking_shipped_together check ((tracking_number is null) = (shipped_at is null));

alter table public.order_status_history drop constraint if exists order_status_history_event_check;
alter table public.order_status_history add constraint order_status_history_event_check
  check (event in ('created', 'payment_submitted', 'payment_accepted', 'payment_rejected', 'expired', 'received', 'cancelled', 'refunded', 'shipped', 'tracking_updated'));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('payment_needed', 'payment_rejected', 'payment_accepted', 'order_cancelled', 'refund_done', 'order_expired', 'review_invite', 'payment_expiring', 'payment_submitted', 'order_shipped'));

create or replace function public.set_tracking_number(p_order_id uuid, p_tracking text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders;
  v_tracking text := btrim(coalesce(p_tracking, ''));
  v_first    boolean;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_tracking !~ '^[A-Za-z0-9-]{5,40}$' then
    raise exception 'invalid_tracking' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  -- Only an order that is paid and still on its way: nothing is sent for an unpaid, cancelled, or already received order.
  if v_order.cancelled_at is not null or v_order.payment_status <> 'paid' or v_order.received_at is not null then
    raise exception 'not_shippable' using errcode = 'P0001';
  end if;
  if v_order.tracking_number = v_tracking then
    return;
  end if;

  v_first := v_order.tracking_number is null;
  update public.orders set tracking_number = v_tracking, shipped_at = coalesce(shipped_at, now()) where id = p_order_id;
  insert into public.order_status_history (order_id, event, actor_id, actor_name, note)
  values (p_order_id, case when v_first then 'shipped' else 'tracking_updated' end, auth.uid(), public.actor_name(), v_tracking);
  perform public.notify(v_order.buyer_id, 'order_shipped', p_order_id,
    jsonb_build_object('number', v_order.number, 'courier', v_order.shipping_label, 'tracking', v_tracking, 'updated', not v_first));
end;
$$;

revoke execute on function public.set_tracking_number(uuid, text) from public, anon, authenticated;
grant execute on function public.set_tracking_number(uuid, text) to authenticated;
