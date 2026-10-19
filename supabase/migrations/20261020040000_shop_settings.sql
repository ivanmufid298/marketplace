-- The shop's own shipping settings, in one row.
--
-- Where parcels leave from (the shipping provider's id for the shop's place), which couriers the shop uses, the order total
-- from which shipping is free, and a flat amount added to (or, if negative, taken off) every quoted shipping cost. Buyers'
-- checkout reads them through the server to ask the shipping provider for rates; only admins change them.
--
-- There is exactly one row (id = 1). Safe to run twice.

create table if not exists public.shop_settings (
  id                    smallint    primary key default 1 check (id = 1),
  -- The shipping provider's id for where parcels are sent from, with the name it was found under. Both or neither.
  origin_destination_id bigint      check (origin_destination_id is null or origin_destination_id > 0),
  origin_label          text        check (origin_label is null or char_length(origin_label) between 1 and 200),
  -- The provider's courier codes the shop offers: "jne", "sicepat", "jnt", "anteraja".
  couriers              text[]      not null default array['jne', 'sicepat', 'jnt', 'anteraja']
                                    check (cardinality(couriers) between 1 and 20 and couriers <@ array['jne', 'sicepat', 'jnt', 'anteraja', 'ninja', 'pos', 'tiki', 'lion', 'sap', 'ide', 'wahana']),
  -- Shipping is free for an order of at least this many rupiah; empty means never free.
  free_shipping_min     bigint      check (free_shipping_min is null or free_shipping_min >= 0),
  -- Rupiah added to every quoted shipping cost (negative: the shop pays part of it).
  shipping_markup       bigint      not null default 0 check (shipping_markup between -1000000 and 1000000),
  updated_at            timestamptz not null default now(),
  constraint shop_settings_origin_together check ((origin_destination_id is null) = (origin_label is null))
);

insert into public.shop_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists shop_settings_set_updated_at on public.shop_settings;
create trigger shop_settings_set_updated_at before update on public.shop_settings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges and Row Level Security: signed-in people read the row (checkout needs it), only admins change it, nobody
-- adds or deletes the one row.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.shop_settings enable row level security;
revoke all on public.shop_settings from anon, authenticated;
grant select on public.shop_settings to authenticated;
grant update (origin_destination_id, origin_label, couriers, free_shipping_min, shipping_markup) on public.shop_settings to authenticated;

drop policy if exists "shop_settings_select" on public.shop_settings;
create policy "shop_settings_select" on public.shop_settings for select to authenticated using (true);

drop policy if exists "shop_settings_update_admin" on public.shop_settings;
create policy "shop_settings_update_admin" on public.shop_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
