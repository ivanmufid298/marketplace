// Runs the order action migration (accepting and rejecting payments, cancelling, refunds, and the buyer confirming receipt) on a real Postgres engine (PGlite, in-process) after the migrations they depend on, and
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
for (const [name, sql] of [["orders", ORDERS], ["payment-proofs bucket", BUCKET], ["order actions", ACTIONS], ["webp proofs", WEBP]]) {
  try { await db.exec(sql); check(`${name} migration runs`, true); } catch (e) { check(`${name} migration runs`, false, e.message); process.exit(1); }
  try { await db.exec(sql); check(`${name} migration runs a second time (idempotent)`, true); } catch (e) { check(`${name} migration runs a second time (idempotent)`, false, e.message); }
}

const ADMIN = "00000000-0000-0000-0000-0000000000ad", ANA = "00000000-0000-0000-0000-0000000000a1", BIMA = "00000000-0000-0000-0000-0000000000b1", CARA = "00000000-0000-0000-0000-0000000000c1";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@x.test', '{"full_name":"Siti Admin"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'), ('${BIMA}', 'bima@x.test', '{"full_name":"Bima"}'), ('${CARA}', 'cara@x.test', '{"full_name":"Cara"}');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.categories (name, slug) values ('Rumah', 'rumah');
  insert into public.products (slug, name, category_id, price, stock, weight_gram, status) values ('mug', 'Mug', 1, 89000, 10, 350, 'active'), ('tote', 'Tote', 1, 129000, 10, 450, 'active');
`);
const addr = `'Ana Putri', '0811000111', 'Jl. Mawar 1', 'Jakarta', '12345'`;
const place = (items) => `select public.place_order('${JSON.stringify(items)}'::jsonb, 'regular', ${addr}) as r`;
const stock = async (slug) => (await one(`select stock from public.products where slug = '${slug}'`)).stock;
const state = async (id) => await one(`select payment_status, payment_rejection_reason, reupload_until, received_at, cancelled_at, cancel_note, refund_status from public.orders where id = '${id}'`);
const events = async (id) => (await rows(`select event from public.order_status_history where order_id = '${id}' order by id`)).map((r) => r.event).join();
const placeAs = async (uid, items) => { await as("authenticated", uid); const r = (await one(place(items))).r; await as("postgres"); return r; };
/** An order whose proof was sent: under review. */
const reviewable = async (uid, items) => {
  const o = await placeAs(uid, items);
  await as("authenticated", uid);
  await db.exec(`select public.submit_payment_proof('${o.id}', 'orders/${o.id}/bukti-${Math.random().toString(36).slice(2)}.png', 'image/png', 100)`);
  await as("postgres");
  return o;
};
/** An order that was accepted: paid. */
const paid = async (uid, items) => { const o = await reviewable(uid, items); await as("authenticated", ADMIN); await db.exec(`select public.accept_payment('${o.id}')`); await as("postgres"); return o; };
const call = (fn, ...args) => `select public.${fn}(${args.map((a) => (a === null ? "null" : `'${a}'`)).join(", ")})`;

// ---- proofs may be WebP now
const W = await placeAs(ANA, [{ product_id: 1, quantity: 1 }]);
check("the proofs bucket takes JPG, PNG, WebP, and PDF", JSON.stringify((await one(`select allowed_mime_types from storage.buckets where id = 'payment-proofs'`)).allowed_mime_types) === '["image/jpeg","image/png","image/webp","application/pdf"]');
await as("authenticated", ANA);
await expectError("a proof type that is still not allowed is refused", `select public.submit_payment_proof('${W.id}', 'orders/${W.id}/x.gif', 'image/gif', 10)`, /invalid_proof/);
await expectError("a proof over 5 MB is still refused", `select public.submit_payment_proof('${W.id}', 'orders/${W.id}/x.webp', 'image/webp', ${5 * 1024 * 1024 + 1})`, /invalid_proof/);
check("a WebP proof is accepted and moves the order under review", (await one(`select public.submit_payment_proof('${W.id}', 'orders/${W.id}/bukti.webp', 'image/webp', 4321) as s`)).s === "under_review");
await as("postgres");
check("the WebP proof is recorded with its type", JSON.stringify(await rows(`select mime_type, size_bytes from public.payment_proofs where order_id = '${W.id}'`)) === '[{"mime_type":"image/webp","size_bytes":4321}]');
await expectError("the table itself still refuses an unknown type", `insert into public.payment_proofs (order_id, object_key, mime_type, size_bytes) values ('${W.id}', 'orders/${W.id}/y', 'image/gif', 10)`, /violates check constraint/i);
await as("authenticated", ANA);
// the storage rules did not change: a WebP file goes in the same folder, and only while the order can still be paid
await as("postgres");

// ---- who may call what
const A = await placeAs(ANA, [{ product_id: 1, quantity: 1 }]);
await as("anon");
for (const fn of ["accept_payment", "reject_payment", "cancel_order", "mark_refunded", "confirm_received"]) {
  await expectError(`anon cannot call ${fn}`, fn === "reject_payment" || fn === "cancel_order" ? call(fn, A.id, "x") : call(fn, A.id), DENIED);
}
await as("authenticated", ANA);
await expectError("a buyer cannot accept a payment", call("accept_payment", A.id), /forbidden/);
await expectError("a buyer cannot reject a payment", call("reject_payment", A.id, "alasan"), /forbidden/);
await expectError("a buyer cannot cancel an order", call("cancel_order", A.id, "alasan"), /forbidden/);
await expectError("a buyer cannot mark a refund", call("mark_refunded", A.id), /forbidden/);
await expectError("nobody can call the name helper directly", `select public.actor_name()`, DENIED);

// ---- accepting a payment
const P1 = await reviewable(ANA, [{ product_id: 1, quantity: 2 }]);
await as("authenticated", ADMIN);
await expectError("an unknown order is not found", call("accept_payment", "00000000-0000-0000-0000-00000000dead"), /order_not_found/);
await expectError("an order with no proof yet cannot be accepted", call("accept_payment", A.id), /not_reviewable/);
await db.exec(call("accept_payment", P1.id));
await as("postgres");
check("accepting moves the order to paid", (await state(P1.id)).payment_status === "paid");
check("the history says who accepted: the admin's profile name", JSON.stringify(await rows(`select event, actor_id, actor_name from public.order_status_history where order_id = '${P1.id}' and event = 'payment_accepted'`)) === `[{"event":"payment_accepted","actor_id":"${ADMIN}","actor_name":"Siti Admin"}]`);
await as("authenticated", ADMIN);
await expectError("a paid order cannot be accepted again", call("accept_payment", P1.id), /not_reviewable/);
await expectError("a paid order cannot be rejected", call("reject_payment", P1.id, "x"), /not_reviewable/);
await as("authenticated", ANA);
check("the buyer sees the accepted payment in their own history", (await events(P1.id)).endsWith("payment_accepted"));

// ---- rejecting a payment
const R1 = await reviewable(ANA, [{ product_id: 2, quantity: 1 }]);
await as("authenticated", ADMIN);
await expectError("a reason is needed to reject", call("reject_payment", R1.id, "   "), /reason_required/);
await expectError("a missing reason is refused", call("reject_payment", R1.id, null), /reason_required/);
await expectError("a reason over 500 characters is refused", call("reject_payment", R1.id, "x".repeat(501)), /reason_required/);
await expectError("an order with no proof cannot be rejected", call("reject_payment", A.id, "x"), /not_reviewable/);
await db.exec(call("reject_payment", R1.id, "  Nominal transfer tidak sesuai  "));
await as("postgres");
const rejected = await state(R1.id);
check("rejecting stores the trimmed reason and opens a two-hour window", rejected.payment_status === "rejected" && rejected.payment_rejection_reason === "Nominal transfer tidak sesuai" && Math.abs((new Date(rejected.reupload_until) - Date.now()) / 60000 - 120) < 2);
check("the history carries the reason as a note", JSON.stringify(await rows(`select event, note, actor_name from public.order_status_history where order_id = '${R1.id}' and event = 'payment_rejected'`)) === '[{"event":"payment_rejected","note":"Nominal transfer tidak sesuai","actor_name":"Siti Admin"}]');
await as("authenticated", ANA);
check("the buyer sends new proof inside the window, which puts the order back under review", (await one(`select public.submit_payment_proof('${R1.id}', 'orders/${R1.id}/ulang.png', 'image/png', 50) as s`)).s === "under_review");
await as("postgres");
check("the old reason is cleared by the new proof", (await state(R1.id)).payment_rejection_reason === null);
check("both proofs are kept", (await count(`select 1 from public.payment_proofs where order_id = '${R1.id}'`)) === 2);

// ---- the window runs out: stock comes back once
await as("authenticated", ADMIN);
await db.exec(call("reject_payment", R1.id, "Masih salah"));
await as("postgres");
const stockBeforeExpiry = await stock("tote");
await db.exec(`update public.orders set reupload_until = now() - interval '1 minute' where id = '${R1.id}'`);
await as("service_role");
await db.exec(`select public.expire_overdue_orders()`);
await as("postgres");
check("a rejected order past its window expires and its stock returns", (await state(R1.id)).payment_status === "expired" && (await stock("tote")) === stockBeforeExpiry + 1);

// ---- cancelling an order that was never paid
const U1 = await placeAs(BIMA, [{ product_id: 1, quantity: 3 }, { product_id: 2, quantity: 1 }]);
const mugBefore = await stock("mug"), toteBefore = await stock("tote");
await as("authenticated", ADMIN);
await expectError("a reason is needed to cancel", call("cancel_order", U1.id, ""), /note_required/);
await expectError("a reason over 500 characters is refused", call("cancel_order", U1.id, "x".repeat(501)), /note_required/);
await expectError("an unknown order cannot be cancelled", call("cancel_order", "00000000-0000-0000-0000-00000000dead", "x"), /order_not_found/);
await db.exec(call("cancel_order", U1.id, "  Pembeli minta batal  "));
await as("postgres");
const cancelledUnpaid = await state(U1.id);
check("cancelling stores the trimmed reason and the time, and no refund is due", cancelledUnpaid.cancel_note === "Pembeli minta batal" && cancelledUnpaid.cancelled_at !== null && cancelledUnpaid.refund_status === null);
check("the stock of an unpaid order goes back on sale", (await stock("mug")) === mugBefore + 3 && (await stock("tote")) === toteBefore + 1);
check("the history says it was cancelled, with the reason", JSON.stringify(await rows(`select event, note from public.order_status_history where order_id = '${U1.id}' and event = 'cancelled'`)) === '[{"event":"cancelled","note":"Pembeli minta batal"}]');
await as("authenticated", ADMIN);
await expectError("a cancelled order cannot be cancelled again", call("cancel_order", U1.id, "lagi"), /not_cancellable/);
await expectError("a cancelled order cannot be accepted or rejected", call("accept_payment", U1.id), /not_reviewable/);
await as("postgres");
// A cancelled order that is also past its deadline must not give its stock back a second time.
await db.exec(`update public.orders set expires_at = now() - interval '1 minute' where id = '${U1.id}'`);
const afterCancel = { mug: await stock("mug"), tote: await stock("tote") };
await as("service_role");
check("the expiry job leaves a cancelled order alone", (await one(`select public.expire_overdue_orders() as n`)).n === 0);
await as("postgres");
check("so the stock is not given back twice", (await stock("mug")) === afterCancel.mug && (await stock("tote")) === afterCancel.tote);
await as("authenticated", BIMA);
await expectError("a cancelled order takes no proof", `select public.submit_payment_proof('${U1.id}', 'orders/${U1.id}/x.png', 'image/png', 10)`, /not_payable/);

// ---- cancelled orders do not count toward the limit of three unpaid orders
await as("postgres");
const slots = [];
for (let i = 0; i < 3; i++) slots.push(await placeAs(BIMA, [{ product_id: 1, quantity: 1 }]));
await as("authenticated", BIMA);
await expectError("three unpaid orders reach the limit", place([{ product_id: 1, quantity: 1 }]), /too_many_pending/);
await as("authenticated", ADMIN);
await db.exec(call("cancel_order", slots[0].id, "Uji batas"));
await as("postgres");
await placeAs(BIMA, [{ product_id: 1, quantity: 1 }]);
check("a cancelled order frees a place under the limit", true);
await as("authenticated", BIMA);
await expectError("a cancelled order that is still inside its time takes no proof either", `select public.submit_payment_proof('${slots[0].id}', 'orders/${slots[0].id}/x.png', 'image/png', 10)`, /not_payable/);
await as("postgres");

// ---- cancelling an order that is under review (proof sent, not accepted) gives the stock back too
const V1 = await reviewable(ANA, [{ product_id: 2, quantity: 2 }]);
const toteV = await stock("tote");
await as("authenticated", ADMIN);
await db.exec(call("cancel_order", V1.id, "Bukti palsu"));
await as("postgres");
check("an order under review is cancelled with its stock back and no refund", (await stock("tote")) === toteV + 2 && (await state(V1.id)).refund_status === null);

// ---- cancelling a paid order
const C1 = await paid(ANA, [{ product_id: 1, quantity: 2 }]);
const mugPaid = await stock("mug");
await as("authenticated", ADMIN);
await db.exec(call("cancel_order", C1.id, "Barang rusak"));
await as("postgres");
check("cancelling a paid order puts it in refund pending", (await state(C1.id)).refund_status === "pending");
check("the stock of a paid order is not changed automatically", (await stock("mug")) === mugPaid);

// ---- refunds
await as("authenticated", ADMIN);
await expectError("an order with no refund due cannot be marked refunded", call("mark_refunded", P1.id), /not_refundable/);
await expectError("an unknown order cannot be marked refunded", call("mark_refunded", "00000000-0000-0000-0000-00000000dead"), /order_not_found/);
await db.exec(call("mark_refunded", C1.id));
await as("postgres");
check("marking it refunded finishes the refund and writes history", (await state(C1.id)).refund_status === "done" && (await events(C1.id)).endsWith("cancelled,refunded"));
await as("authenticated", ADMIN);
await expectError("a refund cannot be marked twice", call("mark_refunded", C1.id), /not_refundable/);

// ---- the buyer confirms receipt
const D1 = await paid(CARA, [{ product_id: 2, quantity: 1 }]);
await as("authenticated", ANA);
await expectError("another buyer cannot confirm someone else's order", call("confirm_received", D1.id), /order_not_found/);
await as("authenticated", BIMA);
await expectError("an unpaid order cannot be confirmed received", call("confirm_received", slots[1].id), /not_receivable/);
await expectError("a cancelled order cannot be confirmed received", call("confirm_received", slots[0].id), /not_receivable/);
await expectError("an unknown order cannot be confirmed received", call("confirm_received", "00000000-0000-0000-0000-00000000dead"), /order_not_found/);
await as("authenticated", CARA);
await db.exec(call("confirm_received", D1.id));
await as("postgres");
check("the owner of a paid order confirms receipt", (await state(D1.id)).received_at !== null && (await events(D1.id)).endsWith("payment_accepted,received"));
check("the history names the buyer", (await one(`select actor_id from public.order_status_history where order_id = '${D1.id}' and event = 'received'`)).actor_id === CARA);
await as("authenticated", CARA);
await expectError("receipt cannot be confirmed twice", call("confirm_received", D1.id), /not_receivable/);
await as("anon");
await expectError("anon cannot confirm receipt", call("confirm_received", D1.id), DENIED);
await as("authenticated", ADMIN);
await expectError("a received order can no longer be cancelled", call("cancel_order", D1.id, "terlambat"), /not_cancellable/);
await as("authenticated", ADMIN);
await expectError("an admin who is not the buyer cannot confirm receipt for them", call("confirm_received", D1.id), /order_not_found/);

// ---- an expired order is over
await as("authenticated", ADMIN);
await expectError("an expired order cannot be cancelled", call("cancel_order", R1.id, "x"), /not_cancellable/);

// ---- reading
await as("authenticated", ADMIN);
check("an admin reads every order and its history", (await count(`select 1 from public.orders`)) >= 8 && (await count(`select 1 from public.order_status_history`)) > 20);
await as("authenticated", ANA);
check("a buyer reads only their own orders", (await count(`select 1 from public.orders where buyer_id <> '${ANA}'`)) === 0);

console.log(failed ? `\n${failed} FAILED` : "\nAll order action checks passed");
process.exit(failed ? 1 : 0);
