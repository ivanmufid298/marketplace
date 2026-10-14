// Checks the notifications to admins about payments to check on a real Postgres engine (PGlite, in-process) after the
// migrations they depend on: who is told and when, that a decision or a cancellation takes it away for every admin, that
// buyers see none of it, and that orders already waiting are announced. Run it with `npm run test:sql` after any change
// to a migration.
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
const REMINDERS = read("20261014070000_expiry_reminders.sql");
const ADMIN_NOTES = read("20261014090000_admin_notifications.sql");

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
for (const [name, sql] of [["orders", ORDERS], ["payment-proofs bucket", BUCKET], ["order actions", ACTIONS], ["webp proofs", WEBP], ["reviews", REVIEWS], ["reviews from orders", FROM_ORDERS], ["notifications", NOTIFICATIONS], ["notifications resolved", RESOLVED], ["expiry reminders", REMINDERS]]) {
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
const place = (items = [{ product_id: 1, quantity: 1 }]) => `select public.place_order('${JSON.stringify(items)}'::jsonb, 'regular', 'Ana Putri', '0811000111', 'Jl. Mawar 1', 'Jakarta', '12345') as r`;
const placeAs = async (uid, items) => { await as("authenticated", uid); const r = (await one(place(items))).r; await as("postgres"); return r; };
const proofFor = async (uid, o) => { await as("authenticated", uid); await db.exec(`select public.submit_payment_proof('${o.id}', 'orders/${o.id}/b-${Math.random().toString(36).slice(2)}.webp', 'image/webp', 100)`); await as("postgres"); };
const admin = async (sql) => { await as("authenticated", ADMIN); await db.exec(sql); await as("postgres"); };
const mine = async (uid, where = "true") => { await as("authenticated", uid); const r = await rows(`select id, kind, order_id, payload, read_at, resolved_at from public.notifications where ${where} order by id`); await as("postgres"); return r; };
const kinds = (list) => list.map((n) => `${n.kind}${n.resolved_at ? "#" : n.read_at ? "*" : ""}`).join(",");



// The orders and users of the tests
const ADMIN2 = "00000000-0000-0000-0000-0000000000ae";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN2}', 'admin2@x.test', '{"full_name":"Budi Admin"}');
  update public.profiles set role = 'admin' where id = '${ADMIN2}';
`);

// An order already waiting for a decision before the migration exists
let buyers = 0;
const fresh = async () => {
  const uid = `00000000-0000-0000-0000-0000000002${String(++buyers).padStart(2, "0")}`;
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'c${buyers}@x.test', '{"full_name":"C${buyers}"}')`);
  return { ...(await placeAs(uid)), uid };
};
const waiting = await fresh();
await proofFor(waiting.uid, waiting);
const cancelledWaiting = await fresh();
await proofFor(cancelledWaiting.uid, cancelledWaiting);
await admin(`select public.cancel_order('${cancelledWaiting.id}', 'Batal sebelum migrasi')`);
check("before the migration nobody is told about a proof", (await count(`select 1 from public.notifications where kind = 'payment_submitted'`)) === 0);

for (const run of ["", " a second time (idempotent)"]) {
  try { await db.exec(ADMIN_NOTES); check(`the admin notifications migration runs${run}`, true); } catch (e) { check(`the admin notifications migration runs${run}`, false, e.message); process.exit(1); }
}
const forAdmin = async (uid, where = "true") => { await as("authenticated", uid); const r = await rows(`select id, kind, order_id, payload, read_at, resolved_at from public.notifications where kind = 'payment_submitted' and ${where} order by id`); await as("postgres"); return r; };
const of = (o) => `order_id = '${o.id}'`;
check("an order already waiting is announced to every admin, once, even after running the migration twice", (await forAdmin(ADMIN, of(waiting))).length === 1 && (await forAdmin(ADMIN2, of(waiting))).length === 1);
check("an order that was cancelled while waiting is not announced", (await forAdmin(ADMIN, of(cancelledWaiting))).length === 0);

// ---- a proof arrives
const order = await fresh();
check("placing an order tells the admins nothing yet", (await forAdmin(ADMIN, of(order))).length === 0);
await proofFor(order.uid, order);
let a1 = await forAdmin(ADMIN, of(order));
let a2 = await forAdmin(ADMIN2, of(order));
check("sending a proof tells every admin, unread and unresolved", a1.length === 1 && a2.length === 1 && a1[0].read_at === null && a1[0].resolved_at === null && a2[0].resolved_at === null, JSON.stringify([a1, a2]));
check("the notification names the order, the recipient, and the total", a1[0].payload.number === order.number && a1[0].payload.recipient === "Ana Putri" && Number(a1[0].payload.total) === Number(order.total), JSON.stringify(a1[0].payload));
check("the buyer is not told about their own proof being waiting for admins", (await forAdmin(order.uid)).length === 0);
check("another buyer sees none of it", (await forAdmin(waiting.uid)).length === 0);

// ---- reading by one admin does not change the other's
await as("authenticated", ADMIN);
await db.exec(`update public.notifications set read_at = now() where id = ${a1[0].id}`);
await as("postgres");
check("one admin reading it leaves it unread for the other", (await forAdmin(ADMIN, of(order)))[0].read_at !== null && (await forAdmin(ADMIN2, of(order)))[0].read_at === null);
await as("authenticated", ADMIN);
const seen = await count(`select 1 from public.notifications where user_id = '${ADMIN2}'`);
const touched = await count(`update public.notifications set read_at = now() where user_id = '${ADMIN2}' returning id`);
await as("postgres");
check("an admin can neither see nor change another admin's notifications", seen === 0 && touched === 0 && (await forAdmin(ADMIN2, of(order)))[0].read_at === null);

// ---- a decision takes it away for everyone
await admin(`select public.accept_payment('${order.id}')`);
check("accepting resolves it for every admin", (await forAdmin(ADMIN, of(order)))[0].resolved_at !== null && (await forAdmin(ADMIN2, of(order)))[0].resolved_at !== null);
check("resolving also marks it read, so it leaves the count", (await forAdmin(ADMIN2, of(order)))[0].read_at !== null);

const rejected = await fresh();
await proofFor(rejected.uid, rejected);
await admin(`select public.reject_payment('${rejected.id}', 'Buram')`);
check("rejecting resolves it", (await forAdmin(ADMIN, of(rejected))).every((n) => n.resolved_at !== null));
await proofFor(rejected.uid, rejected);
const again = await forAdmin(ADMIN, of(rejected));
check("a new proof after a rejection is announced again, and the first one stays resolved", again.length === 2 && again[0].resolved_at !== null && again[1].resolved_at === null, JSON.stringify(again));

const cancelled = await fresh();
await proofFor(cancelled.uid, cancelled);
await admin(`select public.cancel_order('${cancelled.id}', 'Salah pesan')`);
check("cancelling an order under review resolves it", (await forAdmin(ADMIN, of(cancelled))).every((n) => n.resolved_at !== null));

const lapsed = await fresh();
await proofFor(lapsed.uid, lapsed);
await db.exec(`update public.orders set payment_status = 'expired' where id = '${lapsed.id}'`);
check("an order leaving review in any other way resolves it too", (await forAdmin(ADMIN, of(lapsed))).every((n) => n.resolved_at !== null));

// ---- changes that are not a proof or a decision tell nobody
const lapsing = await fresh();
await db.exec(`update public.orders set expires_at = now() - interval '1 minute' where id = '${lapsing.id}'`);
await as("service_role");
await db.exec(`select public.expire_overdue_orders()`);
await as("postgres");
check("an unpaid order that expires tells the admins nothing", (await one(`select payment_status from public.orders where id = '${lapsing.id}'`)).payment_status === "expired" && (await forAdmin(ADMIN, of(lapsing))).length === 0);

const resaved = await fresh();
await proofFor(resaved.uid, resaved);
await db.exec(`update public.orders set payment_status = payment_status where id = '${resaved.id}'`);
check("saving an order under review again without changing it does not announce it twice", (await forAdmin(ADMIN, of(resaved))).length === 1);

const before = await count(`select 1 from public.notifications where kind = 'payment_submitted'`);
const quiet = await fresh();
await db.exec(`update public.orders set phone = '0812000222' where id = '${quiet.id}'`);
await admin(`select public.cancel_order('${quiet.id}', 'Batal')`);
check("an unpaid order that changes or is cancelled tells the admins nothing", (await count(`select 1 from public.notifications where kind = 'payment_submitted'`)) === before);

const sneaky = await fresh();
await db.exec(`update public.orders set cancelled_at = now() where id = '${sneaky.id}'`);
await db.exec(`update public.orders set payment_status = 'under_review' where id = '${sneaky.id}'`);
check("an order that is already cancelled is not announced when it moves to review", (await forAdmin(ADMIN, of(sneaky))).length === 0);

// ---- no admins at all
await db.exec(`update public.profiles set role = 'buyer' where role = 'admin'`);
const nobody = await fresh();
await proofFor(nobody.uid, nobody);
check("with no admin there is nobody to tell and the proof still goes through", (await one(`select payment_status from public.orders where id = '${nobody.id}'`)).payment_status === "under_review");
await db.exec(`update public.profiles set role = 'admin' where id in ('${ADMIN}', '${ADMIN2}')`);

// ---- who may do what
await expectError("a buyer cannot call the trigger function", (await as("authenticated", waiting.uid), `select public.orders_notify_admins()`), DENIED);
await as("postgres");
await expectError("a buyer cannot make an admin notification up", (await as("authenticated", waiting.uid), `insert into public.notifications (user_id, kind) values ('${ADMIN}', 'payment_submitted')`), DENIED);
await as("postgres");
await expectError("an admin cannot write one either", (await as("authenticated", ADMIN), `insert into public.notifications (user_id, kind) values ('${ADMIN}', 'payment_submitted')`), DENIED);
await as("postgres");

console.log(failed ? `\n${failed} FAILED` : "\nAll admin notification checks passed");
process.exit(failed ? 1 : 0);
