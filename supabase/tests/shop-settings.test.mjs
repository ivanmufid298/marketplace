// Checks the shop's shipping settings on a real Postgres engine (PGlite, in-process): who may read and change them, that there is
// exactly one row, and the limits on each setting. Run it with `npm run test:sql` after any change to a migration.
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const SETTINGS = read("20261020040000_shop_settings.sql");
const PREREQUISITES = [
  "20261012061023_profiles_and_roles.sql", "20261012065146_revoke_rls_auto_enable_execute.sql", 
].map(read);


const db = new PGlite();
// An unexpected error should read as one failing line, not a dump of the engine.
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.log(`FAIL  unexpected error  → ${String(e?.message ?? e).split("\n")[0]}`); process.exit(1); });
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`); if (!ok) failed++; };

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid());
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
    declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts, 1) - 1]; end $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`);

const as = async (role, uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  if (role !== "postgres") await db.exec(`set role ${role};`);
};
const rows = async (sql) => (await db.query(sql)).rows;
const count = async (sql) => (await rows(sql)).length;
const one = async (sql) => (await rows(sql))[0];
const expectError = async (name, sql, pattern) => {
  try { await db.exec(sql); check(name, false, "it succeeded"); }
  catch (e) { check(name, pattern.test(`${e.message} ${e.detail ?? ""}`), e.message.split("\n")[0] + (e.detail ? ` [detail ${e.detail}]` : "")); }
};
const DENIED = /permission denied/i;
const RLS = /row-level security/i;
const CHECK = /violates check constraint/i;

for (const sql of PREREQUISITES) {
  try { await db.exec(sql); } catch (e) { check("a prerequisite migration runs", false, e.message); process.exit(1); }
}
for (const run of ["", " a second time (idempotent)"]) {
  try { await db.exec(SETTINGS); check(`the shop settings migration runs${run}`, true); } catch (e) { check(`the shop settings migration runs${run}`, false, e.message); process.exit(1); }
}

const ADMIN = "00000000-0000-0000-0000-0000000000ad", ANA = "00000000-0000-0000-0000-0000000000a1";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@x.test', '{"full_name":"Siti"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
`);
const settings = async (uid) => { await as("authenticated", uid); const r = await rows(`select * from public.shop_settings`); await as("postgres"); return r; };
const fails = async (name, uid, sql, pattern) => {
  await as("authenticated", uid);
  try { await db.exec(sql); check(name, false, "it succeeded"); }
  catch (e) { check(name, pattern.test(`${e.message} ${e.detail ?? ""}`), e.message.split("\n")[0]); }
  finally { await as("postgres"); }
};
const asAdmin = async (sql) => { await as("authenticated", ADMIN); const r = await db.query(sql); await as("postgres"); return r; };

// ---- the starting point
const start = (await settings(ANA))[0];
check("there is exactly one row, with nothing chosen yet and the usual couriers", (await count(`select 1 from public.shop_settings`)) === 1 && start.id === 1 && start.origin_destination_id === null && start.origin_label === null && start.free_shipping_min === null && Number(start.shipping_markup) === 0 && start.couriers.join() === "jne,sicepat,jnt,anteraja");
check("running the migration again did not add a second row or reset it", (await count(`select 1 from public.shop_settings`)) === 1);

// ---- who may read
check("a signed-in buyer reads the settings (checkout needs them)", (await settings(ANA)).length === 1);
check("an admin reads them too", (await settings(ADMIN)).length === 1);
await as("anon");
await expectError("a visitor who is not signed in cannot read them", `select * from public.shop_settings`, DENIED);
await as("postgres");

// ---- who may change
check("an admin sets where parcels leave from, the couriers, the free-shipping minimum, and the markup", (await asAdmin(`update public.shop_settings set origin_destination_id = 17549, origin_label = 'KEBAYORAN LAMA SELATAN, JAKARTA SELATAN', couriers = array['jne','ninja'], free_shipping_min = 500000, shipping_markup = 2000 where id = 1 returning id`)).rows.length === 1);
const saved = (await settings(ANA))[0];
check("and a buyer sees what the admin set", Number(saved.origin_destination_id) === 17549 && saved.couriers.join() === "jne,ninja" && Number(saved.free_shipping_min) === 500000 && Number(saved.shipping_markup) === 2000);
await as("authenticated", ANA);
check("a buyer cannot change a setting (0 rows)", (await count(`update public.shop_settings set shipping_markup = -1000000 returning id`)) === 0);
await as("postgres");
check("so nothing changed", Number((await settings(ADMIN))[0].shipping_markup) === 2000);
await as("authenticated", ANA);
await expectError("a buyer cannot add a second row", `insert into public.shop_settings (id) values (2)`, DENIED);
await expectError("a buyer cannot delete the row", `delete from public.shop_settings`, DENIED);
await as("postgres");
await as("authenticated", ADMIN);
await expectError("not even an admin adds a row", `insert into public.shop_settings (id) values (2)`, DENIED);
await expectError("or deletes the row", `delete from public.shop_settings`, DENIED);
await expectError("or changes the id", `update public.shop_settings set id = 2`, DENIED);
await as("postgres");
await as("anon");
await expectError("a visitor cannot change them", `update public.shop_settings set shipping_markup = 5`, DENIED);
await as("postgres");
check("the table cannot hold a second row even for a superuser", await db.exec(`insert into public.shop_settings (id) values (2)`).then(() => false, (e) => /check constraint/i.test(e.message)));

// ---- the limits
await fails("an origin id without a name is refused", ADMIN, `update public.shop_settings set origin_destination_id = 5, origin_label = null`, CHECK);
await fails("an origin name without an id is refused", ADMIN, `update public.shop_settings set origin_destination_id = null, origin_label = 'X'`, CHECK);
await fails("an origin id of zero is refused", ADMIN, `update public.shop_settings set origin_destination_id = 0, origin_label = 'X'`, CHECK);
await fails("an origin name longer than 200 characters is refused", ADMIN, `update public.shop_settings set origin_destination_id = 5, origin_label = '${"x".repeat(201)}'`, CHECK);
await fails("an empty origin name is refused", ADMIN, `update public.shop_settings set origin_destination_id = 5, origin_label = ''`, CHECK);
check("the origin can be taken away again", (await asAdmin(`update public.shop_settings set origin_destination_id = null, origin_label = null returning id`)).rows.length === 1);
await fails("no couriers at all is refused", ADMIN, `update public.shop_settings set couriers = array[]::text[]`, CHECK);
await fails("a courier the provider does not have is refused", ADMIN, `update public.shop_settings set couriers = array['jne', 'unknown']`, CHECK);
await fails("a courier written in capitals is refused", ADMIN, `update public.shop_settings set couriers = array['JNE']`, CHECK);
check("every courier on the list is accepted", (await asAdmin(`update public.shop_settings set couriers = array['jne','sicepat','jnt','anteraja','ninja','pos','tiki','lion','sap','ide','wahana'] returning id`)).rows.length === 1);
await fails("a negative free-shipping minimum is refused", ADMIN, `update public.shop_settings set free_shipping_min = -1`, CHECK);
check("a free-shipping minimum of zero (always free) and none at all are accepted", (await asAdmin(`update public.shop_settings set free_shipping_min = 0 returning id`)).rows.length === 1 && (await asAdmin(`update public.shop_settings set free_shipping_min = null returning id`)).rows.length === 1);
await fails("a markup above a million is refused", ADMIN, `update public.shop_settings set shipping_markup = 1000001`, CHECK);
await fails("a discount below a million is refused", ADMIN, `update public.shop_settings set shipping_markup = -1000001`, CHECK);
check("a markup of exactly a million and a discount of exactly a million are accepted", (await asAdmin(`update public.shop_settings set shipping_markup = 1000000 returning id`)).rows.length === 1 && (await asAdmin(`update public.shop_settings set shipping_markup = -1000000 returning id`)).rows.length === 1);
await fails("the markup cannot be left empty", ADMIN, `update public.shop_settings set shipping_markup = null`, /null value|not-null/i);
await fails("the couriers cannot be left empty", ADMIN, `update public.shop_settings set couriers = null`, /null value|not-null/i);

// ---- the time of the last change
await asAdmin(`update public.shop_settings set shipping_markup = 0`);
const t1 = (await settings(ADMIN))[0].updated_at;
await db.exec(`select pg_sleep(0.01)`);
await asAdmin(`update public.shop_settings set shipping_markup = 100`);
check("the time of the last change moves with each change", (await settings(ADMIN))[0].updated_at.getTime() > t1.getTime());

console.log(failed ? `\n${failed} FAILED` : "\nAll shop settings checks passed");
process.exit(failed ? 1 : 0);
