-- A reminder before an order runs out of time.
--
-- An unpaid order is held for 2 hours (and 2 hours again after a rejected proof). Until now the buyer was told when it
-- had already expired. `remind_expiring_orders()` tells them 30 minutes before, once per deadline, with the time left:
-- a `payment_expiring` notification that asks for the same thing as `payment_needed` / `payment_rejected` and goes away
-- the same way (proof sent, order cancelled or expired).
--
-- Nothing runs it here: the schedule is in the next migration. Safe to run twice.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('payment_needed', 'payment_rejected', 'payment_accepted', 'order_cancelled', 'refund_done', 'order_expired', 'review_invite', 'payment_expiring'));

-- Finishing what a payment request asked also finishes its reminder.
create or replace function public.resolve_notifications(p_order_ids uuid[], p_kinds text[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set resolved_at = now(), read_at = coalesce(read_at, now())
   where order_id = any (p_order_ids) and resolved_at is null
     and (kind = any (p_kinds) or (kind = 'payment_expiring' and p_kinds && array['payment_needed', 'payment_rejected']));
$$;

create or replace function public.remind_expiring_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select o.id, o.buyer_id, o.number,
           case when o.payment_status = 'awaiting_payment' then o.expires_at else o.reupload_until end as deadline
      from public.orders o
     where o.cancelled_at is null
       and o.buyer_id is not null
       and ((o.payment_status = 'awaiting_payment' and o.expires_at > now() and o.expires_at <= now() + interval '30 minutes')
         or (o.payment_status = 'rejected' and o.reupload_until is not null and o.reupload_until > now() and o.reupload_until <= now() + interval '30 minutes'))
  ), added as (
    insert into public.notifications (user_id, kind, order_id, payload)
    select d.buyer_id, 'payment_expiring', d.id, jsonb_build_object('number', d.number, 'deadline', d.deadline)
      from due d
     where not exists (
       select 1 from public.notifications n
        where n.order_id = d.id and n.kind = 'payment_expiring' and (n.payload ->> 'deadline')::timestamptz = d.deadline
     )
    returning 1
  )
  select count(*) into v_count from added;
  return v_count;
end;
$$;

revoke execute on function public.resolve_notifications(uuid[], text[]) from public, anon, authenticated;
revoke execute on function public.remind_expiring_orders() from public, anon, authenticated;
grant execute on function public.remind_expiring_orders() to service_role;
