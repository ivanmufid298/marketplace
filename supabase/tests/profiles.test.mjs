// Runs supabase/migrations/*_profiles_and_roles.sql on a real Postgres engine (PGlite, in-process) and checks what each
// role may and may not do. Run it with `npm run test:sql` after any change to the migration.
//
// It stands in for Supabase with a hand-made `auth` schema, so it proves the SQL and the privileges, not that
// Supabase itself is configured correctly. Run the manual checks in the README against the real project as well.
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = fs.readFileSync(new URL("../migrations/20261012061023_profiles_and_roles.sql", import.meta.url), "utf8");
const REVOKE_RLS_FN = fs.readFileSync(new URL("../migrations/20261012065146_revoke_rls_auto_enable_execute.sql", import.meta.url), "utf8");
const db = new PGlite();
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`); if (!ok) failed++; };

// ---- a stand-in for the parts of Supabase the migration depends on
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase hands every API role full access to new public tables by default. The migration must cope with that.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);

const as = async (role, uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  if (role !== "postgres") await db.exec(`set role ${role};`);
};
const rows = async (sql) => (await db.query(sql)).rows;
const expectDenied = async (name, sql, pattern = /permission denied/i) => {
  try { await db.exec(sql); check(name, false, "it succeeded"); }
  catch (e) { check(name, pattern.test(e.message), e.message.split("\n")[0]); }
};

// a user that signed up BEFORE the migration (tests the backfill)
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a0', 'legacy@x.test', '{"full_name":"Legacy User"}')`);

// ---- run the migration twice: must work, and must be idempotent
try { await db.exec(MIGRATION); check("migration runs", true); } catch (e) { check("migration runs", false, e.message); process.exit(1); }
try { await db.exec(MIGRATION); check("migration runs a second time (idempotent)", true); } catch (e) { check("migration runs a second time (idempotent)", false, e.message); }

// ---- backfill + sign-up trigger
check("backfill: pre-existing user got a profile", (await rows(`select full_name, role from public.profiles where id = '00000000-0000-0000-0000-0000000000a0'`))[0]?.full_name === "Legacy User");
check("backfill: ...as a buyer", (await rows(`select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a0'`))[0]?.role === "buyer");
check("re-running did not duplicate the backfill", (await rows(`select count(*)::int as n from public.profiles`))[0].n === 1);

const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c", D = "00000000-0000-0000-0000-00000000000d";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${A}', 'a@x.test', '{"full_name":"Alice"}'),
    ('${B}', 'b@x.test', '{"full_name":"Bob"}'),
    ('${C}', 'c@x.test', '{"full_name":"Mallory","role":"admin","is_admin":true}'),
    ('${D}', 'd@x.test', null);
`);
check("sign-up creates a buyer profile", (await rows(`select role from public.profiles where id = '${A}'`))[0]?.role === "buyer");
check("sign-up takes full_name from metadata", (await rows(`select full_name from public.profiles where id = '${A}'`))[0]?.full_name === "Alice");
check("metadata role:'admin' is ignored at sign-up", (await rows(`select role from public.profiles where id = '${C}'`))[0]?.role === "buyer");
check("sign-up with no metadata works (empty name)", (await rows(`select full_name from public.profiles where id = '${D}'`))[0]?.full_name === "");
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000e', 'e@x.test', jsonb_build_object('full_name', repeat('x', 500)))`);
check("an over-long name is truncated instead of failing the sign-up", (await rows(`select char_length(full_name) as n from public.profiles where id = '00000000-0000-0000-0000-00000000000e'`))[0].n === 120);

// ---- what a signed-in buyer can and cannot do
await as("authenticated", A);
check("buyer sees only their own profile", (await rows(`select id from public.profiles`)).length === 1);
check("...and it is theirs", (await rows(`select id from public.profiles`))[0].id === A);
await db.exec(`update public.profiles set full_name = 'Alice Renamed' where id = '${A}'`);
check("buyer can rename themselves", (await rows(`select full_name from public.profiles where id = '${A}'`))[0].full_name === "Alice Renamed");
await db.exec(`update public.profiles set phone = '0812' where id = '${A}'`);
check("buyer can set their phone", (await rows(`select phone from public.profiles where id = '${A}'`))[0].phone === "0812");
await expectDenied("buyer CANNOT make themselves admin", `update public.profiles set role = 'admin' where id = '${A}'`);
await expectDenied("buyer CANNOT do it alongside a legal change", `update public.profiles set full_name = 'x', role = 'admin' where id = '${A}'`);
await expectDenied("buyer CANNOT set role to its own value either (column not granted)", `update public.profiles set role = role where id = '${A}'`);
await expectDenied("buyer CANNOT change their id", `update public.profiles set id = '${B}' where id = '${A}'`);
await expectDenied("buyer CANNOT change created_at", `update public.profiles set created_at = now() where id = '${A}'`);
const touchedOther = await db.query(`update public.profiles set full_name = 'Hacked' where id = '${B}' returning id`);
check("buyer CANNOT edit someone else's profile (RLS hides the row)", touchedOther.rows.length === 0);
await expectDenied("buyer CANNOT insert a profile", `insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'x', 'admin')`);
await expectDenied("buyer CANNOT delete a profile", `delete from public.profiles where id = '${A}'`);
check("is_admin() is false for a buyer", (await rows(`select public.is_admin() as v`))[0].v === false);
await expectDenied("buyer CANNOT call the sign-up trigger function", `select public.handle_new_user()`);
await expectDenied("buyer CANNOT call the updated_at trigger function directly in a way that changes data", `select public.set_updated_at()`, /./);

// ---- the first admin is made by hand, as a privileged role
await as("postgres");
await db.exec(`update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'b@x.test')`);
check("admin promotion by SQL (privileged role) works", (await rows(`select role from public.profiles where id = '${B}'`))[0].role === "admin");
await as("authenticated", B);
check("is_admin() is true for the admin", (await rows(`select public.is_admin() as v`))[0].v === true);
await db.exec(`update public.profiles set full_name = 'Bob Admin' where id = '${B}'`);
check("an admin can still edit their own name", (await rows(`select full_name from public.profiles where id = '${B}'`))[0].full_name === "Bob Admin");
await expectDenied("even an admin cannot change role through the API", `update public.profiles set role = 'buyer' where id = '${B}'`);
await as("authenticated", A);
check("a buyer is still not admin after another user was promoted", (await rows(`select public.is_admin() as v`))[0].v === false);

// ---- updated_at
await as("postgres");
await db.exec(`select pg_sleep(0.05)`);
await as("authenticated", A);
await db.exec(`update public.profiles set full_name = 'Alice Again' where id = '${A}'`);
const stamps = (await rows(`select updated_at > created_at as moved from public.profiles where id = '${A}'`))[0];
check("updated_at moves on update (trigger works for a role without a grant on that column)", stamps.moved === true);

// ---- anonymous visitors
await as("anon");
await expectDenied("anon CANNOT read profiles", `select * from public.profiles`);
await expectDenied("anon CANNOT update profiles", `update public.profiles set full_name = 'x'`);
await expectDenied("anon CANNOT call is_admin()", `select public.is_admin()`);

// ---- the user is deleted: the profile goes with them
await as("postgres");
await db.exec(`delete from auth.users where id = '${D}'`);
check("deleting the user deletes the profile (on delete cascade)", (await rows(`select count(*)::int as n from public.profiles where id = '${D}'`))[0].n === 0);

// ---- RLS really is on, and the privileges are what we meant
check("RLS is enabled on profiles", (await rows(`select relrowsecurity from pg_class where oid = 'public.profiles'::regclass`))[0].relrowsecurity === true);
const grants = await rows(`select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='profiles' and grantee in ('anon','authenticated') order by 1,2`);
check("anon has no table privileges", grants.filter((g) => g.grantee === "anon").length === 0, JSON.stringify(grants.filter((g) => g.grantee === "anon")));
check("authenticated has table-level SELECT only", JSON.stringify(grants.filter((g) => g.grantee === "authenticated")) === JSON.stringify([{ grantee: "authenticated", privilege_type: "SELECT" }]), JSON.stringify(grants.filter((g) => g.grantee === "authenticated")));
const cols = await rows(`select column_name from information_schema.column_privileges where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE' order by 1`);
check("authenticated may UPDATE exactly full_name and phone", JSON.stringify(cols.map((c) => c.column_name)) === JSON.stringify(["full_name", "phone"]), JSON.stringify(cols.map((c) => c.column_name)));
const fn = await rows(`select p.proname, p.prosecdef, p.proconfig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('is_admin','handle_new_user') order by 1`);
check("is_admin and handle_new_user are SECURITY DEFINER with an empty search_path", fn.length === 2 && fn.every((f) => f.prosecdef && f.proconfig?.includes('search_path=""')), JSON.stringify(fn));

// ---- 20261012065146: rls_auto_enable() (a Supabase-managed event trigger function) is locked down
await as("postgres");
let guardOk = true;
try { await db.exec(REVOKE_RLS_FN); } catch { guardOk = false; }
check("revoke migration is a no-op when rls_auto_enable() does not exist", guardOk);
await db.exec(`create function public.rls_auto_enable() returns event_trigger language plpgsql security definer set search_path = '' as $$ begin null; end; $$`);
const canRun = async (role) => (await rows(`select has_function_privilege('${role}', 'public.rls_auto_enable()', 'execute') as v`))[0].v;
check("before the fix, anon and authenticated can execute rls_auto_enable() (Supabase default)", (await canRun("anon")) && (await canRun("authenticated")));
await db.exec(REVOKE_RLS_FN);
check("after the fix, neither anon nor authenticated can execute rls_auto_enable()", !(await canRun("anon")) && !(await canRun("authenticated")));
let againOk = true;
try { await db.exec(REVOKE_RLS_FN); } catch { againOk = false; }
check("revoke migration runs twice without error", againOk);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
