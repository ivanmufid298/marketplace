// Checks the shop's public profile (name and logo) on a real Postgres engine (PGlite, in-process): that everyone reads it, that only admins
// change it, the limits on the name and the logo's key, and the bucket the logo lives in (public, PNG only, admins only).
// Run it with `npm run test:sql` after any change to a migration.
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const PREREQUISITES = [
  "20261012061023_profiles_and_roles.sql", "20261012065146_revoke_rls_auto_enable_execute.sql", "20261013030000_catalog_products.sql", "20261013030100_product_images_bucket.sql",
].map(read);
const ORDERS = read("20261013100000_orders.sql");
const BUCKET = read("20261013100100_payment_proofs_bucket.sql");
const ACTIONS = read("20261013120000_order_admin_actions.sql");
const WEBP = read("20261013140000_payment_proofs_webp.sql");
const REVIEWS = read("20261013080000_product_reviews.sql");
const FROM_ORDERS = read("20261014010000_reviews_from_orders.sql");
const NOTIFICATIONS = read("20261014030000_notifications.sql");
const RESOLVED = read("20261014050000_notifications_resolved.sql");
const ADDRESSES = read("20261016040000_addresses.sql");
const DESTINATION = read("20261019040000_address_destination.sql");
const SETTINGS = read("20261020040000_shop_settings.sql");
const REMINDERS = read("20261014070000_expiry_reminders.sql");
const ADMIN_NOTIFICATIONS = read("20261014090000_admin_notifications.sql");
const PROFILE = read("20261023080000_shop_profile.sql");

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
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

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
for (const [name, sql] of [["orders", ORDERS], ["payment-proofs bucket", BUCKET], ["order actions", ACTIONS], ["webp proofs", WEBP], ["reviews", REVIEWS], ["reviews from orders", FROM_ORDERS], ["notifications", NOTIFICATIONS], ["notifications resolved", RESOLVED], ["addresses", ADDRESSES], ["address destination", DESTINATION], ["shop settings", SETTINGS], ["expiry reminders", REMINDERS], ["admin notifications", ADMIN_NOTIFICATIONS]]) {
  try { await db.exec(sql); check(`${name} migration runs`, true); } catch (e) { check(`${name} migration runs`, false, e.message); process.exit(1); }
  try { await db.exec(sql); check(`${name} migration runs a second time (idempotent)`, true); } catch (e) { check(`${name} migration runs a second time (idempotent)`, false, e.message); }
}

const ADMIN = "00000000-0000-0000-0000-0000000000ad", ANA = "00000000-0000-0000-0000-0000000000a1", BIMA = "00000000-0000-0000-0000-0000000000b1";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@x.test', '{"full_name":"Siti Admin"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'), ('${BIMA}', 'bima@x.test', '{"full_name":"Bima"}');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.categories (name, slug) values ('Rumah', 'rumah');
  insert into public.products (slug, name, category_id, price, stock, weight_gram, status) values ('mug', 'Mug', 1, 89000, 50, 350, 'active'), ('tote', 'Tote', 1, 129000, 50, 450, 'active');
`);


for (const run of ["", " a second time (idempotent)"]) {
  try { await db.exec(PROFILE); check(`the profile migration runs${run}`, true); } catch (e) { check(`the profile migration runs${run}`, false, e.message); process.exit(1); }
}

const profile = async (role, uid) => { await as(role, uid); try { return await rows(`select * from public.shop_profile`); } finally { await as("postgres"); } };
const fails = async (name, role, uid, sql, pattern) => { await as(role, uid); try { await db.exec(sql); check(name, false, "it succeeded"); } catch (e) { check(name, pattern.test(`${e.message} ${e.detail ?? ""}`), e.message.split("\n")[0]); } finally { await as("postgres"); } };
const asAdmin = async (sql) => { await as("authenticated", ADMIN); try { return await db.query(sql); } finally { await as("postgres"); } };
const KEY = "logo/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png";

const actAs = async (role, uid, sql) => { await as(role, uid); try { return await rows(sql); } finally { await as("postgres"); } };

// ---- the starting point
const start = (await profile("postgres"))[0];
check("there is exactly one row, named Market by Kith, with no logo yet", (await count(`select 1 from public.shop_profile`)) === 1 && start.id === 1 && start.shop_name === "Market by Kith" && start.logo_key === null);
check("running the migration again did not add a row or reset anything", (await count(`select 1 from public.shop_profile`)) === 1);

// ---- who may read: everyone, visitors included
check("a visitor who is not signed in reads it", (await profile("anon")).length === 1 && (await profile("anon"))[0].shop_name === "Market by Kith");
check("a buyer reads it, and so does an admin", (await profile("authenticated", ANA)).length === 1 && (await profile("authenticated", ADMIN)).length === 1);

// ---- who may change
check("an admin changes the name and the logo", (await asAdmin(`update public.shop_profile set shop_name = 'Kith Store', logo_key = '${KEY}' where id = 1 returning id`)).rows.length === 1);
const saved = (await profile("anon"))[0];
check("and a visitor sees what the admin set", saved.shop_name === "Kith Store" && saved.logo_key === KEY);
await as("authenticated", ANA);
check("a buyer cannot change it (0 rows)", (await count(`update public.shop_profile set shop_name = 'Hacked' returning id`)) === 0);
await as("postgres");
check("so nothing changed", (await profile("anon"))[0].shop_name === "Kith Store");
await fails("a visitor cannot change it", "anon", "", `update public.shop_profile set shop_name = 'Hacked'`, DENIED);
await fails("a buyer cannot add a second row", "authenticated", ANA, `insert into public.shop_profile (id) values (2)`, DENIED);
await fails("nor delete the row", "authenticated", ANA, `delete from public.shop_profile`, DENIED);
await fails("not even an admin adds a row", "authenticated", ADMIN, `insert into public.shop_profile (id) values (2)`, DENIED);
await fails("or deletes the row", "authenticated", ADMIN, `delete from public.shop_profile`, DENIED);
await fails("or changes the id", "authenticated", ADMIN, `update public.shop_profile set id = 2`, DENIED);
await fails("or the time of the last change", "authenticated", ADMIN, `update public.shop_profile set updated_at = now()`, DENIED);
check("the table cannot hold a second row even for a superuser", await db.exec(`insert into public.shop_profile (id) values (2)`).then(() => false, (e) => /check constraint/i.test(e.message)));

// ---- the name
await fails("an empty name is refused", "authenticated", ADMIN, `update public.shop_profile set shop_name = ''`, CHECK);
await fails("a name of only spaces is refused", "authenticated", ADMIN, `update public.shop_profile set shop_name = '   '`, CHECK);
await fails("a name with a space at the front is refused", "authenticated", ADMIN, `update public.shop_profile set shop_name = ' Kith'`, CHECK);
await fails("a name with a space at the end is refused", "authenticated", ADMIN, `update public.shop_profile set shop_name = 'Kith '`, CHECK);
await fails("a name longer than 60 characters is refused", "authenticated", ADMIN, `update public.shop_profile set shop_name = '${"a".repeat(61)}'`, CHECK);
check("a name of exactly 60 characters, and of one, are accepted", (await asAdmin(`update public.shop_profile set shop_name = '${"a".repeat(60)}' returning id`)).rows.length === 1 && (await asAdmin(`update public.shop_profile set shop_name = 'K' returning id`)).rows.length === 1);
check("a name with spaces inside, an apostrophe, and letters beyond ASCII is accepted", (await asAdmin(`update public.shop_profile set shop_name = 'Toko Kith''s Café ☕' returning id`)).rows.length === 1);
await fails("the name cannot be left empty (null)", "authenticated", ADMIN, `update public.shop_profile set shop_name = null`, /null value|not-null/i);

// ---- the logo key
for (const bad of ["logo/abc.png", "other/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png", "logo/0a1b2c3d-4e5f-6789-abcd-ef0123456789.jpg", "logo/0A1B2C3D-4E5F-6789-ABCD-EF0123456789.png", "/logo/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png", "logo/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png/x", "logo/../0a1b2c3d-4e5f-6789-abcd-ef0123456789.png", "logo/0a1b2c3d-4e5f-6789-abcd-ef0123456789.pngx", ""]) {
  await fails(`the logo key ${JSON.stringify(bad)} is refused`, "authenticated", ADMIN, `update public.shop_profile set logo_key = '${bad}'`, CHECK);
}
check("a logo can be taken away again", (await asAdmin(`update public.shop_profile set logo_key = null returning id`)).rows.length === 1);

// ---- the time of the last change
await asAdmin(`update public.shop_profile set shop_name = 'Satu'`);
const t1 = (await profile("anon"))[0].updated_at;
await db.exec(`select pg_sleep(0.01)`);
await asAdmin(`update public.shop_profile set shop_name = 'Dua'`);
check("the time of the last change moves with each change", (await profile("anon"))[0].updated_at.getTime() > t1.getTime());

// ---- the bucket
const bucket = (await rows(`select * from storage.buckets where id = 'shop-brand'`))[0];
check("the logo bucket is public, PNG only, and 1 MB at most", bucket?.public === true && Number(bucket.file_size_limit) === 1048576 && bucket.allowed_mime_types.join() === "image/png");
const put = (uid, name) => `insert into storage.objects (bucket_id, name) values ('shop-brand', '${name}')`;
await asAdmin(put(ADMIN, KEY));
check("an admin adds a logo file", (await count(`select 1 from storage.objects where bucket_id = 'shop-brand'`)) === 1);
await fails("a buyer cannot add a file", "authenticated", ANA, put(ANA, "logo/x.png"), RLS);
await fails("a visitor cannot add a file", "anon", "", put("", "logo/x.png"), /permission denied|row-level security/i);
check("nobody but an admin can even list the files", (await actAs("authenticated", ANA, `select 1 from storage.objects where bucket_id = 'shop-brand'`)).length === 0 && (await actAs("authenticated", ADMIN, `select 1 from storage.objects where bucket_id = 'shop-brand'`)).length === 1);
await as("authenticated", ANA);
check("a buyer cannot change or delete the file (0 rows)", (await count(`update storage.objects set name = 'logo/y.png' where bucket_id = 'shop-brand' returning id`)) === 0 && (await count(`delete from storage.objects where bucket_id = 'shop-brand' returning id`)) === 0);
await as("postgres");
check("an admin replaces and removes it", (await asAdmin(`update storage.objects set name = 'logo/y.png' where bucket_id = 'shop-brand' returning id`)).rows.length === 1 && (await asAdmin(`delete from storage.objects where bucket_id = 'shop-brand' returning id`)).rows.length === 1);
check("the other bucket is untouched: the logo bucket's policies do not open the product photos to buyers", (await actAs("authenticated", ANA, `select 1 from storage.objects where bucket_id = 'product-images'`)).length === 0);

console.log(failed ? `\n${failed} FAILED` : "\nAll shop profile checks passed");
process.exit(failed ? 1 : 0);
