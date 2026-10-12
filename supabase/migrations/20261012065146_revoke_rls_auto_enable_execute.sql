-- Lock down public.rls_auto_enable().
--
-- Supabase ships this SECURITY DEFINER function as the body of the `ensure_rls` event trigger, which turns RLS on for
-- every new table. It is created in `public`, so by default every role (including `anon`) can execute it through the
-- API, and the security advisor flags that (lints 0028 and 0029). Nobody should call it by hand.
--
-- Revoking EXECUTE is safe: Postgres checks that privilege when an event trigger is created, not each time it fires,
-- so `ensure_rls` keeps working.
--
-- The function is managed by Supabase, so it is missing on a plain Postgres (local tests); guard for that.
-- Safe to run more than once.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
