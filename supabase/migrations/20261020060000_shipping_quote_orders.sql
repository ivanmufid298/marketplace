-- Placing an order at a courier's price, from a quote the server signed.
--
-- The checkout asks the server what a courier charges to send this cart to the buyer's saved address. The server prices it (the shipping
-- provider's tariff, the shop's markup, free shipping) and signs the quote with a secret that only the server and this database know.
-- place_order() now accepts that signed quote instead of one of the shop's own flat rates, and checks everything it can before taking
-- the price: that the secret signed it, that it has not expired, that it is this buyer's, that it is for this saved address's place, that
-- the shop still ships from where the quote says and still offers that courier, and that the cart weighs what the quote was priced for.
-- A browser can therefore not make up a shipping cost.
--
-- With a quote the delivery details are read from the buyer's saved address, not from what the browser sent, so an order cannot be sent
-- to one place and priced for another. Without a quote place_order() works exactly as before, with the shop's own flat rates.
--
-- The secret is kept in Supabase Vault under the name 'shipping_quote_secret' (set by the shop owner, not by this file). Without it a
-- quote cannot be checked and the order is refused with quote_unavailable; orders with the shop's own rates are not affected.
--
-- Safe to run twice.

-- What the order was priced from, kept with it. Empty for orders at the shop's own rates.
alter table public.orders add column if not exists shipping_courier text;
alter table public.orders add column if not exists shipping_service text;
alter table public.orders add column if not exists shipping_etd text;
alter table public.orders add column if not exists shipping_destination_id bigint;
alter table public.orders add column if not exists shipping_weight_gram integer;

-- ---------------------------------------------------------------------------------------------------------------
-- HMAC-SHA256 with the functions every Postgres has (no extension needed). Not callable from the browser.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.hmac_sha256(p_key bytea, p_message bytea)
returns bytea
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_key  bytea := p_key;
  v_ipad bytea;
  v_opad bytea;
  i      integer;
begin
  -- A key longer than the block is replaced by its hash; a shorter one is padded with zeros to the block size (64 bytes).
  if length(v_key) > 64 then
    v_key := sha256(v_key);
  end if;
  v_key := v_key || decode(repeat('00', 64 - length(v_key)), 'hex');
  v_ipad := v_key;
  v_opad := v_key;
  for i in 0..63 loop
    v_ipad := set_byte(v_ipad, i, get_byte(v_key, i) # 54);
    v_opad := set_byte(v_opad, i, get_byte(v_key, i) # 92);
  end loop;
  return sha256(v_opad || sha256(v_ipad || p_message));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Checks a signed quote and returns what it says. Raises invalid_quote for anything wrong with it, and quote_unavailable
-- when there is no secret to check with. Not callable from the browser.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.verify_shipping_quote(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret   text;
  v_body     text;
  v_sig      text;
  v_given    bytea;
  v_expected bytea;
  v_payload  jsonb;
begin
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'shipping_quote_secret' limit 1;
  if v_secret is null or v_secret = '' then
    raise exception 'quote_unavailable' using errcode = 'P0001';
  end if;

  -- Written exactly as the server writes it: two parts of url-safe base64, nothing else (no spaces, no usual base64 characters).
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise exception 'invalid_quote' using errcode = 'P0001';
  end if;
  v_body := split_part(p_token, '.', 1);
  v_sig := split_part(p_token, '.', 2);

  begin
    v_given := decode(translate(v_sig, '-_', '+/') || repeat('=', (4 - length(v_sig) % 4) % 4), 'base64');
    v_expected := public.hmac_sha256(convert_to(v_secret, 'UTF8'), convert_to(v_body, 'UTF8'));
    -- Compared as hashes of both, so how long the match runs says nothing about how much of the signature was right.
    if length(v_given) <> 32 or sha256(v_given) <> sha256(v_expected) then
      raise exception 'invalid_quote' using errcode = 'P0001';
    end if;
    v_payload := convert_from(decode(translate(v_body, '-_', '+/') || repeat('=', (4 - length(v_body) % 4) % 4), 'base64'), 'UTF8')::jsonb;
  exception
    when others then
      raise exception 'invalid_quote' using errcode = 'P0001';
  end;

  -- What the quote has to say: whose it is, the places, the weight, the service, the price, and until when.
  if jsonb_typeof(v_payload) <> 'object'
     or jsonb_typeof(v_payload -> 'u') is distinct from 'string'
     or jsonb_typeof(v_payload -> 'c') is distinct from 'string'
     or jsonb_typeof(v_payload -> 'v') is distinct from 'string'
     or jsonb_typeof(v_payload -> 'e') is distinct from 'string'
     or exists (select 1 from unnest(array['o', 'd', 'w', 'f', 'x']) k where jsonb_typeof(v_payload -> k) is distinct from 'number' or (v_payload ->> k) !~ '^[0-9]{1,15}$')
     or (v_payload ->> 'u') <> auth.uid()::text
     or (v_payload ->> 'x')::bigint <= extract(epoch from now())::bigint then
    raise exception 'invalid_quote' using errcode = 'P0001';
  end if;
  return v_payload;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- place_order(): as before, plus an optional signed quote and the saved address it is for.
-- (A function with another list of arguments is another function, so the old one goes first.)
-- ---------------------------------------------------------------------------------------------------------------
drop function if exists public.place_order(jsonb, text, text, text, text, text, text);

create or replace function public.place_order(
  p_items          jsonb,
  p_shipping_code  text,
  p_recipient_name text,
  p_phone          text,
  p_address        text,
  p_city           text,
  p_postcode       text,
  p_shipping_quote text default null,
  p_address_id     uuid default null
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
  v_addr     public.addresses;
  v_settings public.shop_settings;
  v_quote    jsonb;
  v_code     text;
  v_label    text;
  v_fee      bigint;
  v_weight   integer := 0;
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

  if p_shipping_quote is not null then
    -- A courier's price is for a saved address, whose place it was asked for: the order goes to that address, whatever else was sent.
    if p_address_id is null then
      raise exception 'invalid_address' using errcode = 'P0001';
    end if;
    select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
    if not found or v_addr.destination_id is null then
      raise exception 'invalid_address' using errcode = 'P0001';
    end if;
    v_name := btrim(v_addr.recipient_name);
    v_phone := btrim(v_addr.phone);
    v_address := btrim(v_addr.address);
    v_city := btrim(v_addr.city);
    v_postcode := btrim(v_addr.postcode);

    v_quote := public.verify_shipping_quote(p_shipping_quote);
    if (v_quote ->> 'd')::bigint <> v_addr.destination_id then
      raise exception 'invalid_quote' using errcode = 'P0001';
    end if;
    -- The shop may have moved or changed its couriers since: the quote is then for a trip the shop no longer makes.
    select * into v_settings from public.shop_settings where id = 1;
    if v_settings.origin_destination_id is distinct from (v_quote ->> 'o')::bigint or not ((v_quote ->> 'c') = any (v_settings.couriers)) then
      raise exception 'quote_stale' using errcode = 'P0001';
    end if;
    v_fee := (v_quote ->> 'f')::bigint;
    v_label := upper(v_quote ->> 'c') || ' ' || (v_quote ->> 'v');
    v_code := 'api:' || lower(v_quote ->> 'c') || ':' || lower(v_quote ->> 'v');
  end if;

  if char_length(v_name) not between 1 and 120 or char_length(v_phone) not between 5 and 30
     or char_length(v_address) not between 1 and 500 or char_length(v_city) not between 1 and 100
     or char_length(v_postcode) not between 1 and 10 then
    raise exception 'invalid_address' using errcode = 'P0001';
  end if;

  if p_shipping_quote is null then
    select * into v_method from public.shipping_methods where code = p_shipping_code and is_active;
    if not found then
      raise exception 'invalid_shipping' using errcode = 'P0001';
    end if;
    v_fee := v_method.fee;
    v_label := v_method.label;
    v_code := v_method.code;
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
    select p.id, p.name, p.slug, p.price, p.stock, p.weight_gram
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
    v_weight := v_weight + v_product.weight_gram * v_line.quantity;
  end loop;

  -- The quote was priced for a cart of this weight (rounded up to 100 g, as the server rounds it). A different cart needs a new quote.
  if p_shipping_quote is not null and (ceil(v_weight / 100.0) * 100)::integer <> (v_quote ->> 'w')::integer then
    raise exception 'quote_mismatch' using errcode = 'P0001';
  end if;

  insert into public.orders (buyer_id, recipient_name, phone, address, city, postcode, shipping_code, shipping_label, shipping_fee, subtotal, total, expires_at,
                             shipping_courier, shipping_service, shipping_etd, shipping_destination_id, shipping_weight_gram)
  values (v_uid, v_name, v_phone, v_address, v_city, v_postcode, v_code, v_label, v_fee, v_subtotal, v_subtotal + v_fee, now() + interval '2 hours',
          lower(v_quote ->> 'c'), v_quote ->> 'v', nullif(v_quote ->> 'e', ''), (v_quote ->> 'd')::bigint, (v_quote ->> 'w')::integer)
  returning * into v_order;

  insert into public.order_items (order_id, product_id, product_name, product_slug, image_key, unit_price, quantity)
  select v_order.id, p.id, p.name, p.slug,
         (select pi.object_key from public.product_images pi where pi.product_id = p.id order by pi.sort_order, pi.id limit 1),
         p.price, (e ->> 'quantity')::integer
    from jsonb_array_elements(p_items) e
    join public.products p on p.id = (e ->> 'product_id')::bigint;

  insert into public.order_status_history (order_id, event, actor_id, actor_name)
  values (v_order.id, 'created', v_uid, v_name);

  -- Until proof is sent, the buyer has something to finish, and is reminded of it with the deadline.
  perform public.notify(v_uid, 'payment_needed', v_order.id, jsonb_build_object('number', v_order.number, 'expires_at', v_order.expires_at));

  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'total', v_order.total, 'expires_at', v_order.expires_at);
end;
$$;

-- Who may run what. Postgres lets everyone run a new function unless told otherwise.
revoke execute on function public.hmac_sha256(bytea, bytea) from public, anon, authenticated;
revoke execute on function public.verify_shipping_quote(text) from public, anon, authenticated;
revoke execute on function public.place_order(jsonb, text, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text, text, uuid) to authenticated;
