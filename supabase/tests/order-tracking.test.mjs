// Checks the tracking number (nomor resi) of an order on a real Postgres engine (PGlite, in-process): who may set it, on which orders, what it
// must look like, that the buyer is told and the history records it, that a repeat changes nothing, and that it cannot be written around the function.
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
  try { await db.exec(TRACKING); check(`the tracking migration runs${run}`, true); } catch (e) { check(`the tracking migration runs${run}`, false, e.message); process.exit(1); }
}

const items = [{ product_id: 1, quantity: 1 }];
const actAs = async (role, uid, sql) => { await as(role, uid); try { return await rows(sql); } finally { await as("postgres"); } };
const fails = async (name, role, uid, sql, pattern) => { await as(role, uid); try { await db.exec(sql); check(name, false, "it succeeded"); } catch (e) { check(name, pattern.test(`${e.message} ${e.detail ?? ""}`), e.message.split("\n")[0]); } finally { await as("postgres"); } };
const place = async (uid) => (await actAs("authenticated", uid, `select public.place_order('${JSON.stringify(items)}'::jsonb, 'regular', 'Ana Putri', '0811000111', 'Jl. Mawar 1', 'Jakarta', '12345') as r`))[0].r;
/** An order that is paid: placed, proof sent, accepted by the admin. */
const paidOrder = async (uid = ANA) => {
  const o = await place(uid);
  await actAs("authenticated", uid, `select public.submit_payment_proof('${o.id}', 'orders/${o.id}/b-${Math.random().toString(36).slice(2)}.webp', 'image/webp', 100)`);
  await actAs("authenticated", ADMIN, `select public.accept_payment('${o.id}')`);
  return o;
};
const track = (id, value) => `select public.set_tracking_number('${id}', ${value === null ? "null" : `'${value.replaceAll("'", "''")}'`})`;
const orderRow = async (id) => (await rows(`select tracking_number, shipped_at from public.orders where id = '${id}'`))[0];
const history = async (id) => rows(`select event, actor_name, note from public.order_status_history where order_id = '${id}' and event in ('shipped', 'tracking_updated') order by id`);
const shippedNotes = async (uid, id) => rows(`select payload from public.notifications where user_id = '${uid}' and order_id = '${id}' and kind = 'order_shipped' order by id`);

// ---- who may set it
const paid = await paidOrder();
await fails("a buyer cannot set a tracking number, not even on their own order", "authenticated", ANA, track(paid.id, "JP1234567890"), /forbidden|permission denied/i);
await fails("a visitor cannot", "anon", "", track(paid.id, "JP1234567890"), /permission denied/i);
check("and nothing was written", (await orderRow(paid.id)).tracking_number === null);

// ---- which orders
const unpaid = await place(ANA);
await fails("an order that has not been paid cannot be shipped", "authenticated", ADMIN, track(unpaid.id, "JP1234567890"), /not_shippable/);
await actAs("authenticated", ANA, `select public.submit_payment_proof('${unpaid.id}', 'orders/${unpaid.id}/x.webp', 'image/webp', 100)`);
await fails("nor one whose proof is still being checked", "authenticated", ADMIN, track(unpaid.id, "JP1234567890"), /not_shippable/);
await actAs("authenticated", ADMIN, `select public.reject_payment('${unpaid.id}', 'Buram')`);
await fails("nor one whose proof was rejected", "authenticated", ADMIN, track(unpaid.id, "JP1234567890"), /not_shippable/);
await fails("an order that is not there is not found", "authenticated", ADMIN, track("00000000-0000-0000-0000-000000000000", "JP1234567890"), /order_not_found/);

const cancelled = await paidOrder();
await actAs("authenticated", ADMIN, `select public.cancel_order('${cancelled.id}', 'Stok rusak')`);
await fails("a cancelled order cannot be shipped", "authenticated", ADMIN, track(cancelled.id, "JP1234567890"), /not_shippable/);
const received = await paidOrder();
await actAs("authenticated", ANA, `select public.confirm_received('${received.id}')`);
await fails("an order the buyer already received cannot be shipped", "authenticated", ADMIN, track(received.id, "JP1234567890"), /not_shippable/);
check("none of them got a number", (await rows(`select 1 from public.orders where tracking_number is not null`)).length === 0);

// ---- what a number looks like
for (const [what, value] of [["empty", ""], ["only spaces", "     "], ["null", null], ["4 characters", "AB12"], ["41 characters", "A".repeat(41)], ["with a space inside", "JP 1234567890"], ["with a symbol", "JP1234567890!"], ["with a dot", "JP1234.5678"], ["with a quote", "JP12345'678"], ["with a letter beyond ASCII", "JP12345é678"]]) {
  await fails(`a number that is ${what} is refused`, "authenticated", ADMIN, track(paid.id, value), /invalid_tracking/);
}
check("and none was kept", (await orderRow(paid.id)).tracking_number === null);
for (const ok of ["AB123", "A".repeat(40), "0012-3456-7890", "jp1234567890"]) {
  const other = await paidOrder();
  await actAs("authenticated", ADMIN, track(other.id, ok));
  check(`${ok.length === 40 ? "a 40 character number" : `the number ${ok}`} is accepted`, (await orderRow(other.id)).tracking_number === ok);
  await actAs("authenticated", ANA, `select public.confirm_received('${other.id}')`); // leaves the limit of unpaid orders alone
}

// ---- setting it
await actAs("authenticated", ADMIN, track(paid.id, "  JP1234567890 "));
const first = await orderRow(paid.id);
check("the number is kept, without the spaces around it, and the time it was shipped", first.tracking_number === "JP1234567890" && first.shipped_at !== null);
const h1 = await history(paid.id);
check("and the history knows which admin did it, by their account", (await rows(`select 1 from public.order_status_history where order_id = '${paid.id}' and event = 'shipped' and actor_id = '${ADMIN}'`)).length === 1);
check("the history says it was shipped, by whom, with the number", h1.length === 1 && h1[0].event === "shipped" && h1[0].actor_name === "Siti Admin" && h1[0].note === "JP1234567890");
const n1 = await shippedNotes(ANA, paid.id);
check("the buyer is told, with the order number, the courier's service, and the number", n1.length === 1 && n1[0].payload.tracking === "JP1234567890" && n1[0].payload.courier === "Reguler" && n1[0].payload.updated === false && typeof n1[0].payload.number === "string");
check("nobody else is told: not the other buyer, not the admin", (await shippedNotes(BIMA, paid.id)).length === 0 && (await shippedNotes(ADMIN, paid.id)).length === 0);
const buyerView = await actAs("authenticated", ANA, `select tracking_number, shipped_at from public.orders where id = '${paid.id}'`);
check("the buyer can read the number on their order", buyerView[0]?.tracking_number === "JP1234567890");
check("another buyer cannot see the order at all", (await actAs("authenticated", BIMA, `select 1 from public.orders where id = '${paid.id}'`)).length === 0);

// ---- the same number again, and a correction
await actAs("authenticated", ADMIN, track(paid.id, "JP1234567890"));
check("the same number again changes nothing: no history, no second notification", (await history(paid.id)).length === 1 && (await shippedNotes(ANA, paid.id)).length === 1);
await actAs("authenticated", ADMIN, track(paid.id, "JP9999999999"));
const second = await orderRow(paid.id);
check("a different number replaces it, and the time shipped stays the first one", second.tracking_number === "JP9999999999" && second.shipped_at.getTime() === first.shipped_at.getTime());
const h2 = await history(paid.id);
check("the history keeps both, the second as an update", h2.map((h) => `${h.event}:${h.note}`).join() === "shipped:JP1234567890,tracking_updated:JP9999999999");
const n2 = await shippedNotes(ANA, paid.id);
check("the buyer is told of the correction too, marked as one", n2.length === 2 && n2[1].payload.tracking === "JP9999999999" && n2[1].payload.updated === true);

// ---- around the function
await fails("a buyer cannot write the number straight into the table", "authenticated", ANA, `update public.orders set tracking_number = 'FAKE12345' where id = '${paid.id}'`, /permission denied/i);
await fails("a number needs a time shipped", "postgres", "", `update public.orders set tracking_number = 'ABCDE12345', shipped_at = null where id = '${paid.id}'`, /violates check constraint/i);
await fails("and a time shipped needs a number", "postgres", "", `update public.orders set shipped_at = now() where id = '${unpaid.id}'`, /violates check constraint/i);
await fails("a number of the wrong shape cannot be written even by the owner of the table", "postgres", "", `update public.orders set tracking_number = 'AB CD12345', shipped_at = now() where id = '${paid.id}'`, /violates check constraint/i);
await fails("a notification of this kind is allowed, any other new kind is not", "postgres", "", `insert into public.notifications (user_id, kind, payload) values ('${ANA}', 'order_nonsense', '{}')`, /violates check constraint/i);
await fails("a history event of any other new kind is not allowed", "postgres", "", `insert into public.order_status_history (order_id, event, actor_name) values ('${paid.id}', 'teleported', 'x')`, /violates check constraint/i);
check("an order never shipped has neither", (await orderRow(unpaid.id)).tracking_number === null && (await orderRow(unpaid.id)).shipped_at === null);

console.log(failed ? `\n${failed} FAILED` : "\nAll tracking number checks passed");
process.exit(failed ? 1 : 0);
