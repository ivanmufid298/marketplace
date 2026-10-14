-- Tell the admins when there is a payment to check.
--
-- Until now an admin only knew a transfer proof was waiting by opening the payments page. When an order moves to
-- "under review" (a proof was sent) every admin now gets a `payment_submitted` notification with the order number, the
-- recipient, and the total. It is resolved for all of them as soon as the order is decided (accepted, rejected,
-- expired) or cancelled, so the bell only shows what still needs a decision.
--
-- It is a trigger on the order, so it holds for every way an order can change, not just the functions that exist today.
-- Orders that were already waiting for review when this ran are announced too. Safe to run twice.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('payment_needed', 'payment_rejected', 'payment_accepted', 'order_cancelled', 'refund_done', 'order_expired', 'review_invite', 'payment_expiring', 'payment_submitted'));

create or replace function public.orders_notify_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status = 'under_review' and old.payment_status is distinct from 'under_review' and new.cancelled_at is null then
    insert into public.notifications (user_id, kind, order_id, payload)
    select p.id, 'payment_submitted', new.id, jsonb_build_object('number', new.number, 'recipient', new.recipient_name, 'total', new.total)
      from public.profiles p
     where p.role = 'admin';
  elsif old.payment_status = 'under_review' and (new.payment_status <> 'under_review' or (new.cancelled_at is not null and old.cancelled_at is null)) then
    perform public.resolve_notifications(array[new.id], array['payment_submitted']);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_notify_admins on public.orders;
create trigger orders_notify_admins
  after update of payment_status, cancelled_at on public.orders
  for each row execute function public.orders_notify_admins();

revoke execute on function public.orders_notify_admins() from public, anon, authenticated;

-- Orders already waiting for a decision when this was applied.
insert into public.notifications (user_id, kind, order_id, payload)
select p.id, 'payment_submitted', o.id, jsonb_build_object('number', o.number, 'recipient', o.recipient_name, 'total', o.total)
  from public.orders o
 cross join public.profiles p
 where p.role = 'admin' and o.payment_status = 'under_review' and o.cancelled_at is null
   and not exists (select 1 from public.notifications n where n.user_id = p.id and n.order_id = o.id and n.kind = 'payment_submitted');
