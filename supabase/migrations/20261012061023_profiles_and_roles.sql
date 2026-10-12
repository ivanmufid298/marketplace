-- Profiles and roles.
--
-- One row per auth user. The role ('buyer' or 'admin') lives HERE and nowhere else: never in auth user_metadata,
-- which the signed-in user can edit from the browser, and never in anything the client sends.
--
-- Safe to run more than once. Run it in the Supabase SQL editor, or with `supabase db push`.

-- ---------------------------------------------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text        not null default '' check (char_length(full_name) <= 120),
  phone      text                 check (phone is null or char_length(phone) <= 30),
  role       text        not null default 'buyer' check (role in ('buyer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS is on from the start. With RLS on and no policy for an operation, that operation is denied.
alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges (the part that stops role escalation)
--
-- An RLS UPDATE policy decides which ROWS a user may change, not which COLUMNS. A buyer allowed to update their own
-- row could otherwise run `update profiles set role = 'admin'`. So we also restrict by column: remove every
-- privilege first (a table-level UPDATE grant cannot be narrowed per column), then grant back only what is needed.
-- A column added later is denied until it is granted here on purpose.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
-- No INSERT or DELETE for anyone through the API: rows are created by the trigger below and removed with the user.

-- ---------------------------------------------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------------------------------------------
-- A user may read their own profile. (Add an admin read-all policy when the panel needs to list users.)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- A user may update their own row. Which columns is limited by the grant above; `with check` stops the id changing.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------------
-- is_admin(): is the current user an admin?
--
-- SECURITY DEFINER so it can read profiles without going through the policies. A policy on profiles that queried
-- profiles itself would recurse forever. The empty search_path stops a user-created object from shadowing the names
-- used inside, which is why everything here is schema-qualified. STABLE lets Postgres cache it within a statement.
-- Anonymous callers cannot execute it.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- New users always become buyers
--
-- Runs on every sign-up. The role is hard-coded to the column default and the trigger reads ONLY full_name from the
-- sign-up metadata, so nothing a visitor sends can make them an admin.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest. (A trigger may change columns the caller has no grant on.)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Backfill: users that signed up before this migration get a buyer profile.
-- ---------------------------------------------------------------------------------------------------------------
insert into public.profiles (id, full_name)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 120)
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- The first admin is made by hand, never through the sign-up form. Create the user first (Authentication > Users >
-- Add user, or sign up in the storefront), then run, replacing the email:
--
--   update public.profiles
--   set role = 'admin'
--   where id = (select id from auth.users where email = 'admin@example.com');
--
-- This works in the SQL editor because it runs as a privileged role, not as `authenticated`.
-- ---------------------------------------------------------------------------------------------------------------
