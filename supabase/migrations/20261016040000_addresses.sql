-- A buyer's address book: the addresses they saved on their account, to pick from at checkout.
--
-- Each address belongs to one account and only its owner can read or change it (not even an admin: an order keeps its own
-- copy of the address it was sent to, so the book is the buyer's business). The rules that make a book work are kept here,
-- not in the app, so every way of writing it follows them:
--   - at most 10 addresses per account;
--   - exactly one is the default (the first one saved becomes it, choosing another moves it, and deleting the default hands
--     it to the most recently saved one that is left);
--   - the same size limits as an order's address, so a saved address is always one an order will accept.
--
-- Safe to run twice.

create table if not exists public.addresses (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  -- What the buyer calls it: "Rumah", "Kantor".
  label          text        not null check (char_length(label) between 1 and 30),
  recipient_name text        not null check (char_length(recipient_name) between 1 and 120),
  phone          text        not null check (char_length(phone) between 5 and 30),
  address        text        not null check (char_length(address) between 1 and 500),
  city           text        not null check (char_length(city) between 1 and 100),
  postcode       text        not null check (char_length(postcode) between 1 and 10),
  note           text        not null default '' check (char_length(note) <= 200),
  is_default     boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- A foreign key without an index makes deleting an account scan the whole table, and the book is always read by owner.
create index if not exists addresses_user_idx on public.addresses (user_id, created_at desc);
-- One default per account.
create unique index if not exists addresses_one_default_idx on public.addresses (user_id) where is_default;

-- ---------------------------------------------------------------------------------------------------------------
-- The rules of the book
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.addresses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The changes this function (and the delete rule below) make to the buyer's other addresses are not themselves checked.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.addresses a where a.user_id = new.user_id) >= 10 then
      raise exception 'too_many_addresses' using errcode = 'P0001';
    end if;
    -- The first address is the default whatever was asked.
    if not exists (select 1 from public.addresses a where a.user_id = new.user_id) then
      new.is_default := true;
    end if;
  else
    -- An address never changes hands, and the default is moved by choosing another, not by switching it off.
    new.user_id := old.user_id;
    if old.is_default and not new.is_default then
      new.is_default := true;
    end if;
  end if;

  if new.is_default then
    update public.addresses a set is_default = false where a.user_id = new.user_id and a.id <> new.id and a.is_default;
  end if;
  return new;
end;
$$;

create or replace function public.addresses_after_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_default then
    update public.addresses a set is_default = true
     where a.id = (select b.id from public.addresses b where b.user_id = old.user_id order by b.created_at desc, b.id desc limit 1);
  end if;
  return null;
end;
$$;

drop trigger if exists addresses_before_write on public.addresses;
create trigger addresses_before_write before insert or update on public.addresses for each row execute function public.addresses_before_write();
drop trigger if exists addresses_after_delete on public.addresses;
create trigger addresses_after_delete after delete on public.addresses for each row execute function public.addresses_after_delete();
drop trigger if exists addresses_set_updated_at on public.addresses;
create trigger addresses_set_updated_at before update on public.addresses for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges and Row Level Security: the owner, and nobody else, for everything.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.addresses enable row level security;
revoke all on public.addresses from anon, authenticated;
grant select, delete on public.addresses to authenticated;
-- The owner column is never written by the app (it defaults to the signed-in account) and never changed.
grant insert (label, recipient_name, phone, address, city, postcode, note, is_default) on public.addresses to authenticated;
grant update (label, recipient_name, phone, address, city, postcode, note, is_default) on public.addresses to authenticated;

drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own" on public.addresses for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own" on public.addresses for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own" on public.addresses for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_delete_own" on public.addresses for delete to authenticated using (user_id = (select auth.uid()));
