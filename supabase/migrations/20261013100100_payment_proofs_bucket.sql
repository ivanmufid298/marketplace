-- The private Storage bucket for transfer proofs (PRD 9): JPG, PNG, or PDF up to 5 MB, never public. A buyer may
-- add files only to the folder of their own order while it still awaits payment, may read only their own, and can
-- neither replace nor delete a file (every proof stays as history). Admins may read all of them. The app opens a file
-- through a short-lived signed link.
--
-- Safe to run twice.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The path is orders/<order id>/<file>, so the second folder names the order.
drop policy if exists "payment_proofs_insert_own_order" on storage.objects;
create policy "payment_proofs_insert_own_order" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = 'orders'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[2]
         and o.buyer_id = (select auth.uid())
         and o.payment_status in ('awaiting_payment', 'rejected')
    )
  );

drop policy if exists "payment_proofs_select_own_or_admin" on storage.objects;
create policy "payment_proofs_select_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.orders o
         where o.id::text = (storage.foldername(name))[2] and o.buyer_id = (select auth.uid())
      )
    )
  );
