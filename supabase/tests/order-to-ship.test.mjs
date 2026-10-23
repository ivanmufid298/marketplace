// Checks the notification that tells every admin a paid order is waiting to be handed to the courier, on a real Postgres engine (PGlite,
// in-process): who is told and when, when it is resolved (a tracking number, cancelled, received), that the older notification about payments to
// check still works, and that orders already waiting when the migration runs are announced once.
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
const TRACKING = read("20261023040000_order_tracking.sql");
const TO_SHIP = read("20261023060000_order_to_ship_notifications.sql");

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
for (const [name, sql] of [["orders", ORDERS], ["payment-proofs bucket", BUCKET], ["order actions", ACTIONS], ["webp proofs", WEBP], ["reviews", REVIEWS], ["reviews from orders", FROM_ORDERS], ["notifications", NOTIFICATIONS], ["notifications resolved", RESOLVED], ["addresses", ADDRESSES], ["address destination", DESTINATION], ["shop settings", SETTINGS], ["expiry reminders", REMINDERS], ["admin notifications", ADMIN_NOTIFICATIONS], ["tracking number", TRACKING]]) {
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


const SECOND_ADMIN = "00000000-0000-0000-0000-0000000000ae";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${SECOND_ADMIN}', 'admin2@x.test', '{"full_name":"Budi Admin"}'); update public.profiles set role = 'admin' where id = '${SECOND_ADMIN}';`);

const items = [{ product_id: 1, quantity: 1 }];
const actAs = async (role, uid, sql) => { await as(role, uid); try { return await rows(sql); } finally { await as("postgres"); } };
const place = async (uid = ANA) => (await actAs("authenticated", uid, `select public.place_order('${JSON.stringify(items)}'::jsonb, 'regular', 'Ana Putri', '0811000111', 'Jl. Mawar 1', 'Jakarta', '12345') as r`))[0].r;
const sendProof = (o, uid = ANA) => actAs("authenticated", uid, `select public.submit_payment_proof('${o.id}', 'orders/${o.id}/b-${Math.random().toString(36).slice(2)}.webp', 'image/webp', 100)`);
const toShip = (id, where = "true") => rows(`select user_id, payload, read_at, resolved_at from public.notifications where order_id = '${id}' and kind = 'order_to_ship' and ${where} order by user_id`);
const paidOrder = async () => { const o = await place(); await sendProof(o); await actAs("authenticated", ADMIN, `select public.accept_payment('${o.id}')`); return o; };

// Orders that are already waiting when the migration runs.
const waiting = await paidOrder();
const alreadyShipped = await paidOrder(); await actAs("authenticated", ADMIN, `select public.set_tracking_number('${alreadyShipped.id}', 'JP1234567890')`);
const alreadyCancelled = await paidOrder(); await actAs("authenticated", ADMIN, `select public.cancel_order('${alreadyCancelled.id}', 'Rusak')`);
const alreadyReceived = await paidOrder(); await actAs("authenticated", ANA, `select public.confirm_received('${alreadyReceived.id}')`);
const unpaidBefore = await place(); await sendProof(unpaidBefore);

for (const run of ["", " a second time (idempotent)"]) {
  try { await db.exec(TO_SHIP); check(`the migration runs${run}`, true); } catch (e) { check(`the migration runs${run}`, false, e.message); process.exit(1); }
}
const both = (await toShip(waiting.id));
check("orders already paid and waiting are announced to every admin, once each, even after running it twice", both.length === 2 && both.map((r) => r.user_id).sort().join() === [ADMIN, SECOND_ADMIN].sort().join());
check("but not one that already has a number, was cancelled, was received, or is not paid yet", (await toShip(alreadyShipped.id)).length === 0 && (await toShip(alreadyCancelled.id)).length === 0 && (await toShip(alreadyReceived.id)).length === 0 && (await toShip(unpaidBefore.id)).length === 0);
check("the buyer is never told", (await rows(`select 1 from public.notifications where kind = 'order_to_ship' and user_id in ('${ANA}', '${BIMA}')`)).length === 0);

// ---- when an order is paid
const o1 = await place();
check("a new order is not yet to ship", (await toShip(o1.id)).length === 0);
await sendProof(o1);
check("nor is one whose proof is being checked (that is a payment to check, as before)", (await toShip(o1.id)).length === 0 && (await rows(`select 1 from public.notifications where order_id = '${o1.id}' and kind = 'payment_submitted'`)).length === 2);
await actAs("authenticated", ADMIN, `select public.reject_payment('${o1.id}', 'Buram')`);
check("a rejected proof is not to ship", (await toShip(o1.id)).length === 0);
await sendProof(o1);
await actAs("authenticated", ADMIN, `select public.accept_payment('${o1.id}')`);
const told = await toShip(o1.id);
check("accepting the payment tells every admin", told.length === 2 && told.every((r) => r.read_at === null && r.resolved_at === null));
check("with the order number, the recipient and the courier service", told.every((r) => typeof r.payload.number === "string" && r.payload.recipient === "Ana Putri" && r.payload.courier === "Reguler"));
check("and it resolves the one about the payment to check, as before", (await rows(`select 1 from public.notifications where order_id = '${o1.id}' and kind = 'payment_submitted' and resolved_at is null`)).length === 0);
const seen = await actAs("authenticated", SECOND_ADMIN, `select kind from public.notifications where order_id = '${o1.id}' and kind = 'order_to_ship'`);
check("each admin can read their own", seen.length === 1);
check("a buyer cannot read an admin's", (await actAs("authenticated", ANA, `select 1 from public.notifications where kind = 'order_to_ship'`)).length === 0);

// ---- when it is done
await actAs("authenticated", ADMIN, `select public.set_tracking_number('${o1.id}', 'JP1234567890')`);
const afterTracking = await toShip(o1.id);
check("a tracking number resolves it for every admin, and marks it read", afterTracking.length === 2 && afterTracking.every((r) => r.resolved_at !== null && r.read_at !== null));
await actAs("authenticated", ADMIN, `select public.set_tracking_number('${o1.id}', 'JP9999999999')`);
check("a correction of the number adds nothing", (await toShip(o1.id)).length === 2);

const o2 = await paidOrder();
await actAs("authenticated", ADMIN, `select public.cancel_order('${o2.id}', 'Stok rusak')`);
check("cancelling a paid order resolves it", (await toShip(o2.id)).length === 2 && (await toShip(o2.id, "resolved_at is null")).length === 0);
const o3 = await paidOrder();
await actAs("authenticated", ANA, `select public.confirm_received('${o3.id}')`);
check("the buyer marking it received resolves it, even with no number", (await toShip(o3.id)).length === 2 && (await toShip(o3.id, "resolved_at is null")).length === 0);

// ---- an order that is cancelled before it was paid
const o4 = await place(); await sendProof(o4);
await actAs("authenticated", ADMIN, `select public.cancel_order('${o4.id}', 'Salah')`);
check("an order cancelled before it was paid never was to ship", (await toShip(o4.id)).length === 0);
const o5 = await place();
await actAs("authenticated", ADMIN, `select public.cancel_order('${o5.id}', 'Salah')`);
check("nor one cancelled with no proof", (await toShip(o5.id)).length === 0);

check("cancelling an order whose proof was being checked also settles the payment to check", (await rows(`select 1 from public.notifications where order_id = '${o4.id}' and kind = 'payment_submitted' and resolved_at is null`)).length === 0 && (await rows(`select 1 from public.notifications where order_id = '${o4.id}' and kind = 'payment_submitted'`)).length === 2);

// ---- the trigger holds for any change to the order, not only the functions: direct updates
const direct = await place();
await db.exec(`update public.orders set payment_status = 'under_review', cancelled_at = now() where id = '${direct.id}'`);
check("an order cancelled in the same change that sent it for review is not a payment to check", (await rows(`select 1 from public.notifications where order_id = '${direct.id}' and kind = 'payment_submitted'`)).length === 0);
const directPaidCancelled = await place();
await db.exec(`update public.orders set payment_status = 'paid', cancelled_at = now() where id = '${directPaidCancelled.id}'`);
check("an order cancelled in the same change that paid it is not to ship", (await toShip(directPaidCancelled.id)).length === 0);
const directPaidShipped = await place();
await db.exec(`update public.orders set payment_status = 'paid', tracking_number = 'JP1234567890', shipped_at = now() where id = '${directPaidShipped.id}'`);
check("an order that already has its number when it is paid is not to ship", (await toShip(directPaidShipped.id)).length === 0);
const directPaid = await place();
await db.exec(`update public.orders set payment_status = 'paid' where id = '${directPaid.id}'`);
check("a plain change to paid, even without the functions, tells the admins", (await toShip(directPaid.id)).length === 2);
await db.exec(`update public.orders set payment_status = 'paid', recipient_name = 'Ganti' where id = '${directPaid.id}'`);
check("changing the order again while it stays paid does not tell them twice", (await toShip(directPaid.id)).length === 2);

// ---- the rest still works
await (async () => { try { await db.exec(`insert into public.notifications (user_id, kind, payload) values ('${ANA}', 'order_nonsense', '{}')`); check("an unknown kind is refused", false, "it succeeded"); } catch (e) { check("an unknown kind is refused", /violates check constraint/i.test(e.message)); } })();
check("the buyer is still told their payment was accepted and their order shipped", (await rows(`select kind from public.notifications where user_id = '${ANA}' and order_id = '${o1.id}' and kind in ('payment_accepted', 'order_shipped') order by kind`)).map((r) => r.kind).join() === "order_shipped,order_shipped,payment_accepted");

console.log(failed ? `\n${failed} FAILED` : "\nAll order-to-ship notification checks passed");
process.exit(failed ? 1 : 0);
