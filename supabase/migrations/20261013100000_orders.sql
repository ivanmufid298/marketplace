-- Orders: what a buyer buys, what it costs, and the proof of payment.
--
-- Nobody writes these tables directly. A buyer places an order through place_order() and sends proof through
-- submit_payment_proof(); both run with the database's own rights and decide everything themselves, so a browser can
-- never name its own price, shipping fee, or stock. Reading is limited by Row Level Security: a buyer reads only their
-- own orders, an admin reads all of them. (Admin actions on orders, such as accepting a payment, come in a later migration.)
--
-- Stock is taken when the order is placed and given back when it expires (2 hours without proof) or is cancelled.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------------------------
-- Shipping methods: flat rates for now. Zones and automatic rates (PRD 10) replace this table's role later; the
-- fee is copied into each order, so changing a rate never changes an old order.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.shipping_methods (
  code       text        primary key check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(code) <= 40),
  label      text        not null check (char_length(label) between 1 and 60),
  note       text        not null default '' check (char_length(note) <= 120),
  fee        bigint      not null check (fee >= 0),
  is_active  boolean     not null default true,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists shipping_methods_set_updated_at on public.shipping_methods;
create trigger shipping_methods_set_updated_at
  before update on public.shipping_methods
  for each row execute function public.set_updated_at();

insert into public.shipping_methods (code, label, note, fee, sort_order) values
  ('regular',  'Reguler',  'Estimasi tiba 2–4 hari',                 18000, 1),
  ('express',  'Express',  'Estimasi tiba 1–2 hari',                 32000, 2),
  ('same-day', 'Same day', 'Tiba hari ini sebelum pukul 22.00',      48000, 3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 100001;

create table if not exists public.orders (
  id             uuid        primary key default gen_random_uuid(),
  -- The number the buyer sees and quotes to the admin.
  number         text        not null unique default (nextval('public.order_number_seq'))::text,
  -- Kept (as null) if the buyer's account is deleted, so the shop's records stay whole.
  buyer_id       uuid        references auth.users (id) on delete set null,
  -- The delivery details as they were at checkout.
  recipient_name text        not null check (char_length(recipient_name) between 1 and 120),
  phone          text        not null check (char_length(phone) between 5 and 30),
  address        text        not null check (char_length(address) between 1 and 500),
  city           text        not null check (char_length(city) between 1 and 100),
  postcode       text        not null check (char_length(postcode) between 1 and 10),
  shipping_code  text,
  shipping_label text        not null,
  shipping_fee   bigint      not null check (shipping_fee >= 0),
  subtotal       bigint      not null check (subtotal >= 0),
  total          bigint      not null check (total >= 0),
  payment_status text        not null default 'awaiting_payment'
                             check (payment_status in ('awaiting_payment', 'under_review', 'paid', 'rejected', 'expired')),
  -- Until when proof may be sent. After this the order expires and its stock goes back on sale.
  expires_at     timestamptz not null,
  -- After a rejection the buyer may send new proof until this time.
  payment_rejection_reason text,
  reupload_until timestamptz,
  received_at    timestamptz,
  cancelled_at   timestamptz,
  cancel_note    text,
  refund_status  text        check (refund_status in ('pending', 'done')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint orders_total_matches check (total = subtotal + shipping_fee)
);

create index if not exists orders_buyer_idx on public.orders (buyer_id, created_at desc);
-- Finding orders that have run out of time.
create index if not exists orders_open_expiry_idx on public.orders (expires_at) where payment_status = 'awaiting_payment';

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- What was bought, with the name and price copied from the product at that moment.
create table if not exists public.order_items (
  id           bigint      generated always as identity primary key,
  order_id     uuid        not null references public.orders (id) on delete cascade,
  product_id   bigint      references public.products (id) on delete set null,
  product_name text        not null,
  product_slug text,
  -- The cover photo's storage key, so the order still shows a picture if the product's photos change.
  image_key    text,
  unit_price   bigint      not null check (unit_price >= 0),
  quantity     integer     not null check (quantity between 1 and 1000),
  created_at   timestamptz not null default now()
);
create unique index if not exists order_items_order_product_key on public.order_items (order_id, product_id) where product_id is not null;
create index if not exists order_items_product_idx on public.order_items (product_id);

-- Everything that happened to an order, in order.
create table if not exists public.order_status_history (
  id         bigint      generated always as identity primary key,
  order_id   uuid        not null references public.orders (id) on delete cascade,
  event      text        not null check (event in ('created', 'payment_submitted', 'payment_accepted', 'payment_rejected', 'expired', 'received', 'cancelled', 'refunded')),
  actor_id   uuid        references auth.users (id) on delete set null,
  actor_name text        not null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists order_status_history_order_idx on public.order_status_history (order_id, created_at);
create index if not exists order_status_history_actor_idx on public.order_status_history (actor_id);

-- Transfer proofs. A new proof never replaces an old one; each stays as history.
create table if not exists public.payment_proofs (
  id          bigint      generated always as identity primary key,
  order_id    uuid        not null references public.orders (id) on delete cascade,
  object_key  text        not null unique,
  mime_type   text        not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes  integer     not null check (size_bytes > 0 and size_bytes <= 5 * 1024 * 1024),
  uploaded_by uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists payment_proofs_order_idx on public.payment_proofs (order_id);
create index if not exists payment_proofs_uploader_idx on public.payment_proofs (uploaded_by);

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges: start from nothing. Orders can be read by a signed-in person and changed by nobody directly.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.shipping_methods     enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payment_proofs       enable row level security;

revoke all on public.shipping_methods, public.orders, public.order_items, public.order_status_history, public.payment_proofs from anon, authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;
grant select on public.shipping_methods to anon, authenticated;
grant insert, update, delete on public.shipping_methods to authenticated;
grant select on public.orders, public.order_items, public.order_status_history, public.payment_proofs to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------------------------
-- shipping_methods: everyone sees the active ones (the checkout needs them); admins manage them. Split per role
-- because `anon` has no EXECUTE on is_admin() (see the catalog migration).
drop policy if exists "shipping_methods_select_public" on public.shipping_methods;
create policy "shipping_methods_select_public" on public.shipping_methods
  for select to anon
  using (is_active);

drop policy if exists "shipping_methods_select_authenticated" on public.shipping_methods;
create policy "shipping_methods_select_authenticated" on public.shipping_methods
  for select to authenticated
  using (is_active or (select public.is_admin()));

drop policy if exists "shipping_methods_insert_admin" on public.shipping_methods;
create policy "shipping_methods_insert_admin" on public.shipping_methods
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "shipping_methods_update_admin" on public.shipping_methods;
create policy "shipping_methods_update_admin" on public.shipping_methods
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "shipping_methods_delete_admin" on public.shipping_methods;
create policy "shipping_methods_delete_admin" on public.shipping_methods
  for delete to authenticated
  using ((select public.is_admin()));

-- orders: a buyer reads their own, an admin reads all. There is no insert/update/delete policy at all.
drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
  for select to authenticated
  using (buyer_id = (select auth.uid()) or (select public.is_admin()));

-- The rows that belong to an order are readable exactly when the order is. The subquery runs under the caller's own
-- orders policy.
drop policy if exists "order_items_select" on public.order_items;
create policy "order_items_select" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

drop policy if exists "order_status_history_select" on public.order_status_history;
create policy "order_status_history_select" on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

drop policy if exists "payment_proofs_select" on public.payment_proofs;
create policy "payment_proofs_select" on public.payment_proofs
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

-- ---------------------------------------------------------------------------------------------------------------
-- expire_overdue_orders(): gives back the stock of orders that ran out of time. Safe to run any number of times.
-- Not callable from the browser; place_order() runs it first, and a scheduled job should run it too (PRD 15).
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
     where (payment_status = 'awaiting_payment' and expires_at < now())
        or (payment_status = 'rejected' and reupload_until is not null and reupload_until < now())
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

-- ---------------------------------------------------------------------------------------------------------------
-- place_order(): creates an order from a list of {product_id, quantity}. Prices, names, stock, and the shipping fee
-- all come from the database; the caller supplies only what to buy and where to send it. Everything happens in one
-- transaction, so an order either exists with its stock taken or does not exist at all.
--
-- Failures are raised as errors whose message is a short code (the app shows its own text for each):
--   not_signed_in, invalid_items, invalid_address, invalid_shipping, too_many_pending,
--   product_unavailable and out_of_stock (the product's id is in the error detail).
-- ---------------------------------------------------------------------------------------------------------------
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
  if (select count(*) from public.orders where buyer_id = v_uid and payment_status = 'awaiting_payment') >= 3 then
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

-- ---------------------------------------------------------------------------------------------------------------
-- submit_payment_proof(): records an uploaded transfer proof and moves the order to "under review". The file itself
-- is uploaded to the private payment-proofs bucket first, into orders/<order id>/. Error codes: not_signed_in,
-- order_not_found, not_payable, invalid_proof.
-- ---------------------------------------------------------------------------------------------------------------
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

  if not (
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
-- Who may run the functions. Postgres lets everyone run a new function unless told otherwise.
-- ---------------------------------------------------------------------------------------------------------------
revoke execute on function public.expire_overdue_orders() from public, anon, authenticated;
revoke execute on function public.place_order(jsonb, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.submit_payment_proof(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_payment_proof(uuid, text, text, integer) to authenticated;
-- The scheduled job runs as the service role; nothing in the browser can.
grant execute on function public.expire_overdue_orders() to service_role;
