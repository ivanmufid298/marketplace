-- Where an address is, in the shipping provider's own terms.
--
-- To ask a courier what it costs to send a parcel to an address, the shipping provider needs its own id for the place
-- (down to the subdistrict), not just the city and postcode the buyer typed. The buyer picks the place from a search when
-- they save the address, and both the id and the name it was found under are kept with the address. An address saved by hand
-- (or from before this) has neither, and is priced with the shop's own rates instead.
--
-- Both are filled in or both are empty. Safe to run twice.

alter table public.addresses add column if not exists destination_id bigint check (destination_id is null or destination_id > 0);
alter table public.addresses add column if not exists destination_label text check (destination_label is null or char_length(destination_label) between 1 and 200);

alter table public.addresses drop constraint if exists addresses_destination_together;
alter table public.addresses add constraint addresses_destination_together check ((destination_id is null) = (destination_label is null));

-- Privileges are per column on this table: the owner may write the new ones like the rest.
grant insert (destination_id, destination_label) on public.addresses to authenticated;
grant update (destination_id, destination_label) on public.addresses to authenticated;
