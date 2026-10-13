-- Transfer proofs may also be WebP.
--
-- The shop shrinks a proof photo in the buyer's browser and sends it as WebP (a phone screenshot of a few MB becomes a
-- few hundred KB), so the private bucket, the proofs table, and submit_payment_proof() must accept that type besides
-- JPG, PNG, and PDF. Nothing else changes: same size limit (5 MB), same folder rules, same who-may-do-what.
--
-- Safe to run twice.

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'payment-proofs';

alter table public.payment_proofs drop constraint if exists payment_proofs_mime_type_check;
alter table public.payment_proofs
  add constraint payment_proofs_mime_type_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));

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
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') or p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 5 * 1024 * 1024 then
    raise exception 'invalid_proof' using errcode = 'P0001';
  end if;

  insert into public.payment_proofs (order_id, object_key, mime_type, size_bytes, uploaded_by)
  values (p_order_id, p_object_key, p_mime_type, p_size_bytes, v_uid);

  update public.orders set payment_status = 'under_review', payment_rejection_reason = null where id = p_order_id;
  insert into public.order_status_history (order_id, event, actor_id, actor_name) values (p_order_id, 'payment_submitted', v_uid, v_order.recipient_name);

  return 'under_review';
end;
$$;

-- Same rights as before: create or replace keeps them, but state them so this file stands on its own.
revoke execute on function public.submit_payment_proof(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.submit_payment_proof(uuid, text, text, integer) to authenticated;
