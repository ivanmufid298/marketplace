-- Order actions for admins and for the buyer's "Pesanan selesai".
--
-- Like place_order(), every action is a function that checks the caller itself and writes the order and its history in
-- one transaction; nobody writes the order tables directly. Admin actions refuse anyone who is not an admin, inside
-- the function, so a signed-in buyer who calls them directly is turned away.
--
--   accept_payment     under review -> paid
--   reject_payment     under review -> rejected, with a reason; the buyer has 2 hours to send new proof
--   cancel_order       needs a reason; an order that was never paid gets its stock back, a paid one goes to refund
--   mark_refunded      refund pending -> done
--   confirm_received   the buyer says the goods arrived (only for a paid order)
--
-- Errors are short codes, like place_order(): forbidden, order_not_found, not_reviewable, reason_required,
-- note_required, not_cancellable, not_refundable, not_receivable.
--
-- The three functions below it are replaced so that a cancelled order is left alone: it no longer expires (which would
-- give its stock back a second time), no longer counts toward the limit of unpaid orders, and takes no more proof.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------------------------
-- Replaced: a cancelled order is left alone (see the top of this file).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.expire_overdue_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with expired as (
    update public.orders
       set payment_status = 'expired'
     where cancelled_at is null
       and ((payment_status = 'awaiting_payment' and expires_at < now())
         or (payment_status = 'rejected' and reupload_until is not null and reupload_until < now()))
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from expired;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  update public.products p
     set stock = p.stock + s.quantity
    from (
      select oi.product_id, sum(oi.quantity)::integer as quantity
        from public.order_items oi
       where oi.order_id = any (v_ids) and oi.product_id is not null
       group by oi.product_id
    ) s
   where p.id = s.product_id;

  insert into public.order_status_history (order_id, event, actor_name)
  select unnest(v_ids), 'expired', 'Sistem';

  return cardinality(v_ids);
end;
$$;

create or replace function public.place_order(
  p_items          jsonb,
  p_shipping_code  text,
  p_recipient_name text,
  p_phone          text,
  p_address        text,
  p_city           text,
  p_postcode       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text := btrim(coalesce(p_recipient_name, ''));
  v_phone    text := btrim(coalesce(p_phone, ''));
  v_address  text := btrim(coalesce(p_address, ''));
  v_city     text := btrim(coalesce(p_city, ''));
  v_postcode text := btrim(coalesce(p_postcode, ''));
  v_method   public.shipping_methods;
  v_line     record;
  v_product  record;
  v_subtotal bigint := 0;
  v_order    public.orders;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  -- The items: 1 to 50 lines, each a whole product id and a quantity from 1 to 100, no product twice.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'invalid_items' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'product_id') is distinct from 'number'
        or jsonb_typeof(e -> 'quantity') is distinct from 'number'
        or (e ->> 'product_id') !~ '^[0-9]{1,18}$'
        or case when (e ->> 'quantity') ~ '^[0-9]{1,3}$' then (e ->> 'quantity')::integer else 0 end not between 1 and 100
  ) or (
    select count(*) <> count(distinct e ->> 'product_id') from jsonb_array_elements(p_items) e
  ) then
    raise exception 'invalid_items' using errcode = 'P0001';
  end if;

  if char_length(v_name) not between 1 and 120 or char_length(v_phone) not between 5 and 30
     or char_length(v_address) not between 1 and 500 or char_length(v_city) not between 1 and 100
     or char_length(v_postcode) not between 1 and 10 then
    raise exception 'invalid_address' using errcode = 'P0001';
  end if;

  select * into v_method from public.shipping_methods where code = p_shipping_code and is_active;
  if not found then
    raise exception 'invalid_shipping' using errcode = 'P0001';
  end if;

  -- Orders that ran out of time give their stock back before this one asks for it.
  perform public.expire_overdue_orders();

  -- A few unpaid orders at a time, so nobody can hold the whole shop's stock for two hours.
  if (select count(*) from public.orders where buyer_id = v_uid and payment_status = 'awaiting_payment' and cancelled_at is null) >= 3 then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;

  -- Take the stock, always in product order so two checkouts cannot wait on each other.
  for v_line in
    select (e ->> 'product_id')::bigint as product_id, (e ->> 'quantity')::integer as quantity
      from jsonb_array_elements(p_items) e
     order by 1
  loop
    select p.id, p.name, p.slug, p.price, p.stock
      into v_product
      from public.products p
      join public.categories c on c.id = p.category_id
     where p.id = v_line.product_id and p.status = 'active' and c.is_active
       for update of p;
    if not found then
      raise exception 'product_unavailable' using errcode = 'P0001', detail = v_line.product_id::text;
    end if;
    if v_product.stock < v_line.quantity then
      raise exception 'out_of_stock' using errcode = 'P0001', detail = v_line.product_id::text;
    end if;
    update public.products set stock = stock - v_line.quantity where id = v_product.id;
    v_subtotal := v_subtotal + v_product.price * v_line.quantity;
  end loop;

  insert into public.orders (buyer_id, recipient_name, phone, address, city, postcode, shipping_code, shipping_label, shipping_fee, subtotal, total, expires_at)
  values (v_uid, v_name, v_phone, v_address, v_city, v_postcode, v_method.code, v_method.label, v_method.fee, v_subtotal, v_subtotal + v_method.fee, now() + interval '2 hours')
  returning * into v_order;

  insert into public.order_items (order_id, product_id, product_name, product_slug, image_key, unit_price, quantity)
  select v_order.id, p.id, p.name, p.slug,
         (select pi.object_key from public.product_images pi where pi.product_id = p.id order by pi.sort_order, pi.id limit 1),
         p.price, (e ->> 'quantity')::integer
    from jsonb_array_elements(p_items) e
    join public.products p on p.id = (e ->> 'product_id')::bigint;

  insert into public.order_status_history (order_id, event, actor_id, actor_name)
  values (v_order.id, 'created', v_uid, v_name);

  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'total', v_order.total, 'expires_at', v_order.expires_at);
end;
$$;

create or replace function public.submit_payment_proof(
  p_order_id   uuid,
  p_object_key text,
  p_mime_type  text,
  p_size_bytes integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  select * into v_order from public.orders where id = p_order_id and buyer_id = v_uid for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if v_order.cancelled_at is not null or not (
    (v_order.payment_status = 'awaiting_payment' and v_order.expires_at > now())
    or (v_order.payment_status = 'rejected' and v_order.reupload_until is not null and v_order.reupload_until > now())
  ) then
    raise exception 'not_payable' using errcode = 'P0001';
  end if;

  -- The file must be one this order's folder holds, so one order cannot claim another's upload.
  if p_object_key is null or left(p_object_key, char_length('orders/' || p_order_id::text || '/')) <> 'orders/' || p_order_id::text || '/'
     or char_length(p_object_key) > 300 or p_object_key ~ '\.\.' then
    raise exception 'invalid_proof' using errcode = 'P0001';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'application/pdf') or p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 5 * 1024 * 1024 then
    raise exception 'invalid_proof' using errcode = 'P0001';
  end if;

  insert into public.payment_proofs (order_id, object_key, mime_type, size_bytes, uploaded_by)
  values (p_order_id, p_object_key, p_mime_type, p_size_bytes, v_uid);

  update public.orders set payment_status = 'under_review', payment_rejection_reason = null where id = p_order_id;
  insert into public.order_status_history (order_id, event, actor_id, actor_name) values (p_order_id, 'payment_submitted', v_uid, v_order.recipient_name);

  return 'under_review';
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- The name written on the history for an admin's action.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.actor_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif((select p.full_name from public.profiles p where p.id = (select auth.uid())), ''), 'Admin');
$$;

create or replace function public.accept_payment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.cancelled_at is not null or v_order.payment_status <> 'under_review' then
    raise exception 'not_reviewable' using errcode = 'P0001';
  end if;

  update public.orders set payment_status = 'paid', payment_rejection_reason = null, reupload_until = null where id = p_order_id;
  insert into public.order_status_history (order_id, event, actor_id, actor_name) values (p_order_id, 'payment_accepted', auth.uid(), public.actor_name());
end;
$$;

create or replace function public.reject_payment(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.orders;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 1 and 500 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.cancelled_at is not null or v_order.payment_status <> 'under_review' then
    raise exception 'not_reviewable' using errcode = 'P0001';
  end if;

  -- The buyer has two hours from now to send new proof; after that the order expires and its stock goes back.
  update public.orders
     set payment_status = 'rejected', payment_rejection_reason = v_reason, reupload_until = now() + interval '2 hours'
   where id = p_order_id;
  insert into public.order_status_history (order_id, event, actor_id, actor_name, note) values (p_order_id, 'payment_rejected', auth.uid(), public.actor_name(), v_reason);
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_note  text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_note) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  -- Until the buyer confirms receipt. An expired order is already over, and its stock is already back.
  if v_order.cancelled_at is not null or v_order.received_at is not null or v_order.payment_status = 'expired' then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  if v_order.payment_status = 'paid' then
    -- Money was received: it has to be returned. The stock is not touched; the admin decides whether the goods come back.
    update public.orders set cancelled_at = now(), cancel_note = v_note, refund_status = 'pending' where id = p_order_id;
  else
    -- Nothing was ever accepted: the reserved stock goes back on sale.
    update public.orders set cancelled_at = now(), cancel_note = v_note where id = p_order_id;
    update public.products p
       set stock = p.stock + s.quantity
      from (
        select oi.product_id, sum(oi.quantity)::integer as quantity
          from public.order_items oi
         where oi.order_id = p_order_id and oi.product_id is not null
         group by oi.product_id
      ) s
     where p.id = s.product_id;
  end if;
  insert into public.order_status_history (order_id, event, actor_id, actor_name, note) values (p_order_id, 'cancelled', auth.uid(), public.actor_name(), v_note);
end;
$$;

create or replace function public.mark_refunded(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.refund_status is distinct from 'pending' then
    raise exception 'not_refundable' using errcode = 'P0001';
  end if;

  update public.orders set refund_status = 'done' where id = p_order_id;
  insert into public.order_status_history (order_id, event, actor_id, actor_name) values (p_order_id, 'refunded', auth.uid(), public.actor_name());
end;
$$;

-- The buyer's own button: "the goods arrived". Only the owner, only for an order that was paid and not cancelled.
create or replace function public.confirm_received(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  select * into v_order from public.orders where id = p_order_id and buyer_id = v_uid for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'paid' or v_order.received_at is not null or v_order.cancelled_at is not null then
    raise exception 'not_receivable' using errcode = 'P0001';
  end if;

  update public.orders set received_at = now() where id = p_order_id;
  insert into public.order_status_history (order_id, event, actor_id, actor_name) values (p_order_id, 'received', v_uid, v_order.recipient_name);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Who may run what. The admin actions check is_admin() inside, so being signed in is enough to reach them and not
-- enough to pass them.
-- ---------------------------------------------------------------------------------------------------------------
revoke execute on function public.actor_name() from public, anon, authenticated;
revoke execute on function public.accept_payment(uuid) from public, anon, authenticated;
revoke execute on function public.reject_payment(uuid, text) from public, anon, authenticated;
revoke execute on function public.cancel_order(uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_refunded(uuid) from public, anon, authenticated;
revoke execute on function public.confirm_received(uuid) from public, anon, authenticated;
grant execute on function public.accept_payment(uuid) to authenticated;
grant execute on function public.reject_payment(uuid, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.mark_refunded(uuid) to authenticated;
grant execute on function public.confirm_received(uuid) to authenticated;
