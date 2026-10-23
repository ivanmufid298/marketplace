-- Tell the admins when a paid order is waiting to be handed to the courier.
--
-- Until now an admin only heard about a transfer proof to check (payment_submitted). Once they accepted it, nothing reminded them that the
-- order still had to be sent and its tracking number entered. When an order becomes paid, every admin now gets an `order_to_ship`
-- notification (order number, recipient, the courier service). It is resolved for all of them as soon as the order has a tracking number,
-- is cancelled, or is marked received by the buyer, so the bell only shows what still needs sending.
--
-- It extends the trigger on the order that already announces payments to check, so it holds for every way an order can change. Paid
-- orders that were already waiting for a tracking number when this ran are announced too. Safe to run twice.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('payment_needed', 'payment_rejected', 'payment_accepted', 'order_cancelled', 'refund_done', 'order_expired', 'review_invite', 'payment_expiring', 'payment_submitted', 'order_shipped', 'order_to_ship'));

create or replace function public.orders_notify_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A proof was sent: a payment to check.
  if new.payment_status = 'under_review' and old.payment_status is distinct from 'under_review' and new.cancelled_at is null then
    insert into public.notifications (user_id, kind, order_id, payload)
    select p.id, 'payment_submitted', new.id, jsonb_build_object('number', new.number, 'recipient', new.recipient_name, 'total', new.total)
      from public.profiles p
     where p.role = 'admin';
  end if;
  -- It was decided (accepted, rejected, expired) or cancelled: nothing left to check.
  if old.payment_status = 'under_review' and (new.payment_status <> 'under_review' or (new.cancelled_at is not null and old.cancelled_at is null)) then
    perform public.resolve_notifications(array[new.id], array['payment_submitted']);
  end if;
  -- It was paid: an order to send.
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and new.cancelled_at is null and new.tracking_number is null then
    insert into public.notifications (user_id, kind, order_id, payload)
    select p.id, 'order_to_ship', new.id, jsonb_build_object('number', new.number, 'recipient', new.recipient_name, 'courier', new.shipping_label)
      from public.profiles p
     where p.role = 'admin';
  end if;
  -- It was sent (a tracking number), cancelled, or received: nothing left to send.
  if (new.tracking_number is not null and old.tracking_number is null)
     or (new.cancelled_at is not null and old.cancelled_at is null)
     or (new.received_at is not null and old.received_at is null) then
    perform public.resolve_notifications(array[new.id], array['order_to_ship']);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_notify_admins on public.orders;
create trigger orders_notify_admins
  after update of payment_status, cancelled_at, tracking_number, received_at on public.orders
  for each row execute function public.orders_notify_admins();

revoke execute on function public.orders_notify_admins() from public, anon, authenticated;

-- Paid orders already waiting for a tracking number when this was applied.
insert into public.notifications (user_id, kind, order_id, payload)
select p.id, 'order_to_ship', o.id, jsonb_build_object('number', o.number, 'recipient', o.recipient_name, 'courier', o.shipping_label)
  from public.orders o
 cross join public.profiles p
 where p.role = 'admin' and o.payment_status = 'paid' and o.cancelled_at is null and o.received_at is null and o.tracking_number is null
   and not exists (select 1 from public.notifications n where n.user_id = p.id and n.order_id = o.id and n.kind = 'order_to_ship');
