// Runs the notifications migration (after all the order migrations) and checks who is told what, when, and who may read it on a real Postgres engine (PGlite, in-process) after the migrations they depend on, and
// checks what each role may and may not do, and that placing an order is correct and all-or-nothing. Run it with
// `npm run test:sql` after any change to a migration.
//
// It stands in for Supabase with a hand-made `auth` and `storage` schema, so it proves the SQL, constraints, and
// privileges, not that the real project is configured the same way. Check the real project after applying.
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
for (const [name, sql] of [["orders", ORDERS], ["payment-proofs bucket", BUCKET], ["order actions", ACTIONS], ["webp proofs", WEBP], ["reviews", REVIEWS], ["reviews from orders", FROM_ORDERS], ["notifications", NOTIFICATIONS], ["notifications resolved", RESOLVED]]) {
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

// ---- placing an order tells the buyer what is left to do
const order = await placeAs(ANA, [{ product_id: 1, quantity: 2 }]);
let list = await mine(ANA);
check("placing an order notifies the buyer that payment is needed, with the number and deadline", list.length === 1 && list[0].kind === "payment_needed" && list[0].payload.number === order.number && typeof list[0].payload.expires_at === "string" && list[0].order_id === order.id && list[0].read_at === null, JSON.stringify(list));
check("nobody else is told", (await mine(BIMA)).length === 0 && (await count(`select 1 from public.notifications where user_id <> '${ANA}'`)) === 0);

// ---- sending proof resolves it, and tells no one
await proofFor(ANA, order);
list = await mine(ANA);
check("sending proof marks the payment-needed notification read, and adds none", kinds(list) === "payment_needed#");
const firstResolvedAt = list[0].resolved_at;
check("a request resolved while still unread is marked read too (it leaves the unread count)", list[0].read_at !== null && list[0].resolved_at !== null);

// ---- rejecting: the buyer is told why, and the reminder comes back until they send proof again
await admin(`select public.reject_payment('${order.id}', '  Nominal tidak sesuai ')`);
list = await mine(ANA);
const rej = list[list.length - 1];
check("rejecting notifies the buyer with the reason and the new deadline", kinds(list) === "payment_needed#,payment_rejected" && rej.payload.reason === "Nominal tidak sesuai" && rej.payload.number === order.number && Math.abs((new Date(rej.payload.reupload_until) - Date.now()) / 60000 - 120) < 2);
await proofFor(ANA, order);
check("sending new proof marks the rejection notification read", kinds(await mine(ANA)) === "payment_needed#,payment_rejected#");

// ---- accepting
await admin(`select public.accept_payment('${order.id}')`);
list = await mine(ANA);
check("resolving again later does not move the time it was resolved", (await mine(ANA, `order_id = '${order.id}' and kind = 'payment_needed'`))[0].resolved_at.getTime() === firstResolvedAt.getTime());
check("accepting notifies the buyer that the payment was accepted, unread", list[list.length - 1].kind === "payment_accepted" && list[list.length - 1].read_at === null && list[list.length - 1].payload.number === order.number);

// ---- receiving invites a review
await as("authenticated", ANA);
await db.exec(`select public.confirm_received('${order.id}')`);
await as("postgres");
list = await mine(ANA);
check("confirming receipt invites the buyer to review", list[list.length - 1].kind === "review_invite" && list[list.length - 1].payload.number === order.number);

// ---- cancelling an unpaid order
const U = await placeAs(ANA, [{ product_id: 1, quantity: 1 }]);
check("a new unpaid order has an open reminder", kinds(await mine(ANA, `order_id = '${U.id}'`)) === "payment_needed");
await admin(`select public.cancel_order('${U.id}', '  Stok habis  ')`);
list = await mine(ANA, `order_id = '${U.id}'`);
check("cancelling closes the reminder and tells the buyer why, with no refund due", kinds(list) === "payment_needed#,order_cancelled" && list[1].payload.note === "Stok habis" && list[1].payload.refund === false);

// ---- cancelling a paid order, then refunding
const P = await placeAs(BIMA, [{ product_id: 1, quantity: 1 }]);
await proofFor(BIMA, P);
await admin(`select public.accept_payment('${P.id}')`);
await admin(`select public.cancel_order('${P.id}', 'Barang rusak')`);
list = await mine(BIMA, `order_id = '${P.id}'`);
check("cancelling a paid order says a refund is due", list[list.length - 1].kind === "order_cancelled" && list[list.length - 1].payload.refund === true);
await admin(`select public.mark_refunded('${P.id}')`);
list = await mine(BIMA, `order_id = '${P.id}'`);
check("recording the refund tells the buyer", list[list.length - 1].kind === "refund_done" && list[list.length - 1].payload.number === P.number);

// ---- running out of time
const T = await placeAs(BIMA, [{ product_id: 1, quantity: 1 }]);
await db.exec(`update public.orders set expires_at = now() - interval '1 minute' where id = '${T.id}'`);
await as("service_role");
await db.exec(`select public.expire_overdue_orders()`);
await as("postgres");
list = await mine(BIMA, `order_id = '${T.id}'`);
check("an order that ran out of time closes its reminder and tells the buyer it expired", kinds(list) === "payment_needed#,order_expired" && list[1].payload.number === T.number);
await as("service_role");
await db.exec(`select public.expire_overdue_orders()`);
await as("postgres");
check("running the job again tells no one twice", (await count(`select 1 from public.notifications where order_id = '${T.id}'`)) === 2);

// ---- a buyer whose account is gone has nobody to tell
const G = await placeAs(BIMA, [{ product_id: 1, quantity: 1 }]);
await db.exec(`update public.orders set buyer_id = null where id = '${G.id}'`);
const before = await count(`select 1 from public.notifications`);
await admin(`select public.cancel_order('${G.id}', 'Akun dihapus')`);
check("cancelling an order whose buyer is gone writes no notification", (await count(`select 1 from public.notifications`)) === before);

// An order that ran out of time after its buyer's account was deleted must not break the job.
const H = await placeAs(BIMA, [{ product_id: 1, quantity: 1 }]);
await db.exec(`update public.orders set buyer_id = null, expires_at = now() - interval '1 minute' where id = '${H.id}'`);
const beforeExpiry = await count(`select 1 from public.notifications`);
await as("service_role");
await db.exec(`select public.expire_overdue_orders()`);
await as("postgres");
check("an order that expires after its buyer's account is gone is expired without any notification", (await one(`select payment_status from public.orders where id = '${H.id}'`)).payment_status === "expired" && (await count(`select 1 from public.notifications`)) === beforeExpiry);

// ---- reading is not the same as being done
const R = await placeAs(BIMA, [{ product_id: 1, quantity: 1 }]);
await as("authenticated", BIMA);
await db.exec(`update public.notifications set read_at = now() where order_id = '${R.id}' and kind = 'payment_needed'`);
await as("postgres");
check("reading a request does not resolve it: it is still open until the proof arrives", kinds(await mine(BIMA, `order_id = '${R.id}'`)) === "payment_needed*");
await proofFor(BIMA, R);
check("sending the proof then resolves it", kinds(await mine(BIMA, `order_id = '${R.id}'`)) === "payment_needed#");
check("a resolved request is also read, so it leaves the unread count", (await count(`select 1 from public.notifications where order_id = '${R.id}' and read_at is null`)) === 0);

// ---- an invitation to review is done when every item has been reviewed
const V = await placeAs(ANA, [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }]).catch(() => null);
if (V === null) throw new Error("the review order could not be placed");
await proofFor(ANA, V);
await admin(`select public.accept_payment('${V.id}')`);
await as("authenticated", ANA);
await db.exec(`select public.confirm_received('${V.id}')`);
await as("postgres");
const items = await rows(`select id from public.order_items where order_id = '${V.id}' order by id`);
check("after receipt the invitation is open", kinds(await mine(ANA, `order_id = '${V.id}'`)).endsWith("review_invite"));
await as("authenticated", ANA);
await db.exec(`select public.submit_review(${items[0].id}, 5, 'Satu')`);
await as("postgres");
check("one review of two items leaves the invitation open", kinds(await mine(ANA, `order_id = '${V.id}'`)).endsWith("review_invite"));
await as("authenticated", ANA);
await db.exec(`select public.submit_review(${items[1].id}, 4, 'Dua')`);
await as("postgres");
check("reviewing the last item resolves the invitation", kinds(await mine(ANA, `order_id = '${V.id}'`)).endsWith("review_invite#"));
await as("authenticated", ANA);
await db.exec(`select public.submit_review(${items[1].id}, 3, 'Dua diubah')`);
await as("postgres");
check("editing a review keeps it resolved", kinds(await mine(ANA, `order_id = '${V.id}'`)).endsWith("review_invite#"));

// An order with an item whose product is gone: that item cannot be reviewed, so it must not keep the invitation open.
const W = await placeAs(ANA, [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }]);
await proofFor(ANA, W);
await admin(`select public.accept_payment('${W.id}')`);
await as("authenticated", ANA);
await db.exec(`select public.confirm_received('${W.id}')`);
await as("postgres");
const witems = await rows(`select id from public.order_items where order_id = '${W.id}' order by id`);
await db.exec(`update public.order_items set product_id = null where id = ${witems[1].id}`);
await as("authenticated", ANA);
await db.exec(`select public.submit_review(${witems[0].id}, 5, 'Hanya satu yang bisa')`);
await as("postgres");
check("an item whose product is gone does not keep the invitation open", kinds(await mine(ANA, `order_id = '${W.id}'`)).endsWith("review_invite#"));
await as("authenticated", ANA);
await expectError("a buyer cannot call the review-invite helper", `select public.resolve_review_invite('${W.id}')`, DENIED);
await as("postgres");

// ---- requests from before the column existed are resolved when the order moved on
await db.exec(`insert into public.notifications (user_id, kind, order_id, payload) values ('${ANA}', 'payment_needed', '${V.id}', '{"number":"x"}'), ('${ANA}', 'payment_rejected', '${V.id}', '{"number":"x"}')`);
await db.exec(RESOLVED);
check("an old unread request that is resolved by the migration is read too", (await count(`select 1 from public.notifications where order_id = '${V.id}' and kind in ('payment_needed','payment_rejected') and read_at is null`)) === 0);
check("an old request for an order that is paid is resolved by the migration", (await count(`select 1 from public.notifications where order_id = '${V.id}' and kind in ('payment_needed','payment_rejected') and resolved_at is null`)) === 0);
const stillOpen = await placeAs(BIMA, [{ product_id: 1, quantity: 1 }]);
await db.exec(`update public.notifications set resolved_at = null, read_at = null where order_id = '${stillOpen.id}'`);
await db.exec(RESOLVED);
check("but a request for an order that still awaits payment stays open", kinds(await mine(BIMA, `order_id = '${stillOpen.id}'`)) === "payment_needed");

// ---- who may read and change them
await as("anon");
await expectError("anon cannot read notifications", `select 1 from public.notifications`, DENIED);
await as("authenticated", ANA);
const seen = await rows(`select id, user_id from public.notifications`);
check("a buyer reads only their own notifications", seen.length > 0 && seen.every((n) => n.user_id === ANA));
await expectError("a buyer cannot write a notification", `insert into public.notifications (user_id, kind) values ('${ANA}', 'payment_accepted')`, DENIED);
await expectError("a buyer cannot delete a notification", `delete from public.notifications`, DENIED);
await expectError("a buyer cannot change what a notification says", `update public.notifications set kind = 'refund_done'`, DENIED);
await expectError("a buyer cannot move a notification to someone else", `update public.notifications set user_id = '${BIMA}'`, DENIED);
await expectError("a buyer cannot call the notify helper", `select public.notify('${ANA}', 'payment_accepted', null, '{}')`, DENIED);
await expectError("a buyer cannot call the resolve helper", `select public.resolve_notifications(array[]::uuid[], array['payment_needed'])`, DENIED);
const unread = (await rows(`select id from public.notifications where read_at is null`)).length;
check("a buyer has unread notifications to read", unread > 0);
await db.exec(`update public.notifications set read_at = now() where read_at is null`);
check("a buyer marks their own notifications read", (await count(`select 1 from public.notifications where read_at is null`)) === 0);
await db.exec(`update public.notifications set read_at = null where id = (select min(id) from public.notifications)`);
check("a buyer can mark one unread again (it is only the read time)", (await count(`select 1 from public.notifications where read_at is null`)) === 1);
check("a buyer's change never reaches another buyer's notifications (0 rows)", (await count(`update public.notifications set read_at = now() where user_id = '${BIMA}' returning id`)) === 0);
await as("authenticated", BIMA);
check("the other buyer's notifications are untouched", (await count(`select 1 from public.notifications where read_at is null`)) > 0);
await as("authenticated", ADMIN);
check("an admin has no notifications of their own, and does not read the buyers'", (await count(`select 1 from public.notifications`)) === 0);

// ---- constraints and cleanup
await as("postgres");
await expectError("an unknown kind is refused", `insert into public.notifications (user_id, kind) values ('${ANA}', 'spam')`, /violates check constraint/i);
await expectError("a payload that is not an object is refused", `insert into public.notifications (user_id, kind, payload) values ('${ANA}', 'payment_accepted', '[1]')`, /violates check constraint/i);
const countBefore = await count(`select 1 from public.notifications where user_id = '${ANA}'`);
await db.exec(`delete from auth.users where id = '${ANA}'`);
check("deleting an account deletes its notifications", countBefore > 0 && (await count(`select 1 from public.notifications where user_id = '${ANA}'`)) === 0);

console.log(failed ? `\n${failed} FAILED` : "\nAll notification checks passed");
process.exit(failed ? 1 : 0);
