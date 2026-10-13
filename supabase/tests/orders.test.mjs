// Runs the order migrations on a real Postgres engine (PGlite, in-process) after the migrations they depend on, and
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

const db = new PGlite();
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
for (const [name, sql] of [["orders", ORDERS], ["payment-proofs bucket", BUCKET]]) {
  try { await db.exec(sql); check(`${name} migration runs`, true); } catch (e) { check(`${name} migration runs`, false, e.message); process.exit(1); }
  try { await db.exec(sql); check(`${name} migration runs a second time (idempotent)`, true); } catch (e) { check(`${name} migration runs a second time (idempotent)`, false, e.message); }
}

const ADMIN = "00000000-0000-0000-0000-0000000000ad", ANA = "00000000-0000-0000-0000-0000000000a1", BIMA = "00000000-0000-0000-0000-0000000000b1";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@x.test', '{"full_name":"Admin"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'), ('${BIMA}', 'bima@x.test', '{"full_name":"Bima"}');
  update public.profiles set role = 'admin' where id = '${ADMIN}';

  insert into public.categories (name, slug, is_active) values ('Rumah', 'rumah', true), ('Lama', 'lama', false);
  insert into public.products (slug, name, category_id, price, stock, weight_gram, status) values
    ('mug',   'Mug',   1, 89000, 5, 350, 'active'),
    ('tote',  'Tote',  1, 129000, 3, 450, 'active'),
    ('draf',  'Draf',  1, 10000, 9, 100, 'draft'),
    ('lawas', 'Lawas', 2, 20000, 9, 100, 'active'),
    ('habis', 'Habis', 1, 50000, 0, 100, 'active');
  insert into public.product_images (product_id, object_key, sort_order) values (1, 'products/1/second', 1), (1, 'products/1/cover', 0), (2, 'products/2/only', 0);
`);

const SHIP = `'regular'`;
const addr = `'Ana Putri', '0811000111', 'Jl. Mawar 1', 'Jakarta', '12345'`;
const place = (items, ship = SHIP, address = addr) => `select public.place_order('${JSON.stringify(items)}'::jsonb, ${ship}, ${address}) as r`;
const stock = async (slug) => (await one(`select stock from public.products where slug = '${slug}'`)).stock;
const status = async (id) => (await one(`select payment_status from public.orders where id = '${id}'`)).payment_status;
/** Places an order as someone and comes back to the table owner. */
const placeAs = async (uid, items) => { await as("authenticated", uid); const r = (await one(place(items))).r; await as("postgres"); return r; };

// ---- shipping methods
await as("anon");
check("anon sees the three active shipping methods", (await count(`select 1 from public.shipping_methods`)) === 3);
await expectError("anon cannot change a shipping method", `update public.shipping_methods set fee = 0`, DENIED);
await as("authenticated", ANA);
check("buyer sees the shipping methods", (await count(`select 1 from public.shipping_methods`)) === 3);
check("buyer cannot change a shipping method (0 rows)", (await count(`update public.shipping_methods set fee = 0 returning code`)) === 0);
await expectError("buyer cannot add a shipping method", `insert into public.shipping_methods (code, label, fee) values ('x', 'X', 1)`, RLS);
await as("authenticated", ADMIN);
await db.exec(`insert into public.shipping_methods (code, label, fee, is_active) values ('ambil', 'Ambil sendiri', 0, false)`);
check("admin sees inactive methods too", (await count(`select 1 from public.shipping_methods`)) === 4);
await as("authenticated", ANA);
check("buyer does not see an inactive method", (await count(`select 1 from public.shipping_methods where code = 'ambil'`)) === 0);
await as("anon");
check("anon does not see an inactive method", (await count(`select 1 from public.shipping_methods where code = 'ambil'`)) === 0);

// ---- who may call what
await expectError("anon cannot place an order", place([{ product_id: 1, quantity: 1 }]), DENIED);
await expectError("anon cannot submit proof", `select public.submit_payment_proof(gen_random_uuid(), 'orders/x/y', 'image/png', 10)`, DENIED);
await as("authenticated", ANA);
await expectError("a buyer cannot run the expiry job", `select public.expire_overdue_orders()`, DENIED);
await as("service_role");
check("the service role can run the expiry job", (await one(`select public.expire_overdue_orders() as n`)).n === 0);

// ---- placing an order: Ana buys 2 mugs and a tote
const A1 = await placeAs(ANA, [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 1 }]);
check("placing an order returns its number, total, and deadline", /^\d{6}$/.test(A1.number) && A1.total === 2 * 89000 + 129000 + 18000 && typeof A1.expires_at === "string", JSON.stringify(A1));
const order = await one(`select * from public.orders where id = '${A1.id}'`);
check("the order belongs to the signed-in buyer, awaiting payment", order.buyer_id === ANA && order.payment_status === "awaiting_payment");
check("the order's totals come from the database prices and the shipping method", order.subtotal === 307000 && order.shipping_fee === 18000 && order.total === 325000 && order.shipping_label === "Reguler" && order.shipping_code === "regular");
check("the delivery details are stored", order.recipient_name === "Ana Putri" && order.phone === "0811000111" && order.address === "Jl. Mawar 1" && order.city === "Jakarta" && order.postcode === "12345");
const minutes = (new Date(order.expires_at) - new Date(order.created_at)) / 60000;
check("the order expires two hours after it was made", Math.abs(minutes - 120) < 1, `${minutes} minutes`);
check("the stock was taken", (await stock("mug")) === 3 && (await stock("tote")) === 2);
const items = await rows(`select product_name, unit_price, quantity, image_key, product_slug from public.order_items where order_id = '${A1.id}' order by product_id`);
check("the items keep name, price, quantity, and slug as they were", JSON.stringify(items.map((i) => [i.product_name, i.unit_price, i.quantity, i.product_slug])) === '[["Mug",89000,2,"mug"],["Tote",129000,1,"tote"]]');
check("each item keeps the product's cover photo (the first by order)", items[0].image_key === "products/1/cover" && items[1].image_key === "products/2/only");
check("the history starts with a created entry by the buyer", JSON.stringify(await rows(`select event, actor_id, actor_name from public.order_status_history where order_id = '${A1.id}'`)) === `[{"event":"created","actor_id":"${ANA}","actor_name":"Ana Putri"}]`);

// Bima buys a tote.
const B1 = await placeAs(BIMA, [{ product_id: 2, quantity: 1 }]);
check("order numbers are unique and count up", Number(B1.number) === Number(A1.number) + 1);
check("the stock is now 3 mugs and 1 tote", (await stock("mug")) === 3 && (await stock("tote")) === 1);

// ---- placing an order: refusals, and nothing changes when it is refused
const snapshot = async () => JSON.stringify([await count(`select 1 from public.orders`), await count(`select 1 from public.order_items`), await count(`select 1 from public.order_status_history`), await stock("mug"), await stock("tote"), await stock("habis")]);
const untouched = await snapshot();
await as("authenticated", BIMA);
await expectError("an empty list of items is refused", place([]), /invalid_items/);
await expectError("a quantity of 0 is refused", place([{ product_id: 1, quantity: 0 }]), /invalid_items/);
await expectError("a quantity over 100 is refused", place([{ product_id: 1, quantity: 101 }]), /invalid_items/);
await expectError("a fractional quantity is refused", place([{ product_id: 1, quantity: 1.5 }]), /invalid_items/);
await expectError("the same product twice is refused", place([{ product_id: 1, quantity: 1 }, { product_id: 1, quantity: 1 }]), /invalid_items/);
await expectError("an item that is not an object is refused", `select public.place_order('[1]'::jsonb, ${SHIP}, ${addr})`, /invalid_items/);
await expectError("a product id given as text is refused", `select public.place_order('[{"product_id":"1","quantity":1}]'::jsonb, ${SHIP}, ${addr})`, /invalid_items/);
await expectError("items that are not a list are refused", `select public.place_order('{"a":1}'::jsonb, ${SHIP}, ${addr})`, /invalid_items/);
await expectError("no items at all is refused", `select public.place_order(null, ${SHIP}, ${addr})`, /invalid_items/);
await expectError("51 lines are refused", place(Array.from({ length: 51 }, (_, i) => ({ product_id: i + 1, quantity: 1 }))), /invalid_items/);
await expectError("a missing recipient is refused", place([{ product_id: 1, quantity: 1 }], SHIP, `'  ', '0811000111', 'Jl. Mawar 1', 'Jakarta', '12345'`), /invalid_address/);
await expectError("a phone number that is too short is refused", place([{ product_id: 1, quantity: 1 }], SHIP, `'Ana', '1234', 'Jl. Mawar 1', 'Jakarta', '12345'`), /invalid_address/);
await expectError("a postcode over 10 characters is refused", place([{ product_id: 1, quantity: 1 }], SHIP, `'Ana', '0811000111', 'Jl. Mawar 1', 'Jakarta', '12345678901'`), /invalid_address/);
await expectError("a missing city is refused", place([{ product_id: 1, quantity: 1 }], SHIP, `'Ana', '0811000111', 'Jl. Mawar 1', null, '12345'`), /invalid_address/);
await expectError("an unknown shipping method is refused", place([{ product_id: 1, quantity: 1 }], `'teleport'`), /invalid_shipping/);
await expectError("an inactive shipping method is refused", place([{ product_id: 1, quantity: 1 }], `'ambil'`), /invalid_shipping/);
await expectError("a missing shipping method is refused", place([{ product_id: 1, quantity: 1 }], `null`), /invalid_shipping/);
await expectError("a product that does not exist is refused", place([{ product_id: 999, quantity: 1 }]), /product_unavailable.*999/);
await expectError("a draft product is refused", place([{ product_id: 3, quantity: 1 }]), /product_unavailable.*3/);
await expectError("a product in a hidden category is refused", place([{ product_id: 4, quantity: 1 }]), /product_unavailable.*4/);
await expectError("more than the stock is refused", place([{ product_id: 1, quantity: 4 }]), /out_of_stock.*1/);
await expectError("a product with no stock is refused", place([{ product_id: 5, quantity: 1 }]), /out_of_stock.*5/);
await expectError("one bad line refuses the whole order", place([{ product_id: 1, quantity: 1 }, { product_id: 5, quantity: 1 }]), /out_of_stock.*5/);
await as("postgres");
check("none of the refused orders left anything behind: no order, items, history, or taken stock", (await snapshot()) === untouched);

// ---- reading orders
await as("anon");
await expectError("anon cannot read orders", `select 1 from public.orders`, DENIED);
await expectError("anon cannot read items", `select 1 from public.order_items`, DENIED);
await as("authenticated", ANA);
check("a buyer reads only their own orders", (await count(`select 1 from public.orders`)) === 1 && (await one(`select id from public.orders`)).id === A1.id);
check("a buyer reads only their own items and history", (await count(`select 1 from public.order_items`)) === 2 && (await count(`select 1 from public.order_status_history`)) === 1);
await as("authenticated", BIMA);
check("another buyer sees none of Ana's orders, items, or history", (await count(`select 1 from public.orders where id = '${A1.id}'`)) === 0 && (await count(`select 1 from public.order_items where order_id = '${A1.id}'`)) === 0 && (await count(`select 1 from public.order_status_history where order_id = '${A1.id}'`)) === 0);
await as("authenticated", ADMIN);
check("an admin reads every order", (await count(`select 1 from public.orders`)) === 2);

// ---- nobody writes the tables directly
for (const [who, uid] of [["a buyer", ANA], ["an admin", ADMIN]]) {
  await as("authenticated", uid);
  await expectError(`${who} cannot insert an order`, `insert into public.orders (recipient_name, phone, address, city, postcode, shipping_label, shipping_fee, subtotal, total, expires_at) values ('x','12345','x','x','1','x',0,0,0, now())`, DENIED);
  await expectError(`${who} cannot change an order`, `update public.orders set total = 1`, DENIED);
  await expectError(`${who} cannot delete an order`, `delete from public.orders`, DENIED);
  await expectError(`${who} cannot insert an item`, `insert into public.order_items (order_id, product_name, unit_price, quantity) values ('${A1.id}', 'x', 1, 1)`, DENIED);
  await expectError(`${who} cannot change an item`, `update public.order_items set unit_price = 1`, DENIED);
  await expectError(`${who} cannot write history`, `insert into public.order_status_history (order_id, event, actor_name) values ('${A1.id}', 'created', 'x')`, DENIED);
  await expectError(`${who} cannot insert a proof directly`, `insert into public.payment_proofs (order_id, object_key, mime_type, size_bytes) values ('${A1.id}', 'orders/${A1.id}/x', 'image/png', 1)`, DENIED);
  await expectError(`${who} cannot take the order number sequence`, `select nextval('public.order_number_seq')`, DENIED);
}

// ---- constraints on the order tables (as the owner, so only the constraints can say no)
await as("postgres");
await expectError("a total that does not match the parts is refused", `insert into public.orders (recipient_name, phone, address, city, postcode, shipping_label, shipping_fee, subtotal, total, expires_at) values ('x','12345','x','x','1','x',10,10,10, now())`, CHECK);
await expectError("an unknown payment status is refused", `update public.orders set payment_status = 'maybe' where id = '${A1.id}'`, CHECK);
await expectError("a refund status other than pending or done is refused", `update public.orders set refund_status = 'later' where id = '${A1.id}'`, CHECK);
await expectError("an item with quantity 0 is refused", `insert into public.order_items (order_id, product_name, unit_price, quantity) values ('${A1.id}', 'x', 1, 0)`, CHECK);
await expectError("a product twice in one order is refused", `insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values ('${A1.id}', 1, 'x', 1, 1)`, /unique|duplicate/i);
await expectError("an unknown history event is refused", `insert into public.order_status_history (order_id, event, actor_name) values ('${A1.id}', 'teleported', 'x')`, CHECK);
await expectError("a proof type other than JPG, PNG, or PDF is refused", `insert into public.payment_proofs (order_id, object_key, mime_type, size_bytes) values ('${A1.id}', 'orders/${A1.id}/z', 'text/html', 10)`, CHECK);
await expectError("a proof over 5 MB is refused", `insert into public.payment_proofs (order_id, object_key, mime_type, size_bytes) values ('${A1.id}', 'orders/${A1.id}/z', 'image/png', ${5 * 1024 * 1024 + 1})`, CHECK);

// ---- the limit on unpaid orders: Ana already has A1; two more make three
const A2 = await placeAs(ANA, [{ product_id: 1, quantity: 1 }]);
const A3 = await placeAs(ANA, [{ product_id: 2, quantity: 1 }]);
await as("authenticated", ANA);
await expectError("a fourth unpaid order is refused", place([{ product_id: 1, quantity: 1 }]), /too_many_pending/);
await as("postgres");
check("the stock is now 2 mugs and no totes", (await stock("mug")) === 2 && (await stock("tote")) === 0);

// ---- proof of payment for A1
await as("authenticated", ANA);
const proofKey = `orders/${A1.id}/bukti.png`;
await expectError("proof for someone else's order is refused as not found", `select public.submit_payment_proof('${B1.id}', 'orders/${B1.id}/y.png', 'image/png', 10)`, /order_not_found/);
await expectError("proof for an order that does not exist is refused", `select public.submit_payment_proof(gen_random_uuid(), 'orders/x/y', 'image/png', 10)`, /order_not_found/);
await expectError("a file from another order's folder is refused", `select public.submit_payment_proof('${A1.id}', 'orders/${B1.id}/bukti.png', 'image/png', 10)`, /invalid_proof/);
await expectError("a file outside any order folder is refused", `select public.submit_payment_proof('${A1.id}', 'bukti.png', 'image/png', 10)`, /invalid_proof/);
await expectError("a path that climbs out of the folder is refused", `select public.submit_payment_proof('${A1.id}', 'orders/${A1.id}/../x.png', 'image/png', 10)`, /invalid_proof/);
await expectError("a proof type that is not allowed is refused", `select public.submit_payment_proof('${A1.id}', '${proofKey}', 'text/html', 10)`, /invalid_proof/);
await expectError("an empty proof is refused", `select public.submit_payment_proof('${A1.id}', '${proofKey}', 'image/png', 0)`, /invalid_proof/);
await expectError("a proof over 5 MB is refused by the function too", `select public.submit_payment_proof('${A1.id}', '${proofKey}', 'image/png', ${5 * 1024 * 1024 + 1})`, /invalid_proof/);
check("sending proof moves the order to under review", (await one(`select public.submit_payment_proof('${A1.id}', '${proofKey}', 'image/png', 12345) as s`)).s === "under_review");
await as("postgres");
check("the order is under review and the proof is recorded", (await status(A1.id)) === "under_review" && (await count(`select 1 from public.payment_proofs where order_id = '${A1.id}'`)) === 1);
check("the history says proof was sent", (await rows(`select event from public.order_status_history where order_id = '${A1.id}' order by id`)).map((r) => r.event).join() === "created,payment_submitted");
await as("authenticated", ANA);
await expectError("proof for an order already under review is refused", `select public.submit_payment_proof('${A1.id}', 'orders/${A1.id}/lagi.png', 'image/png', 10)`, /not_payable/);
check("a buyer reads their own proof row", (await count(`select 1 from public.payment_proofs`)) === 1);
await as("authenticated", BIMA);
check("another buyer does not see it", (await count(`select 1 from public.payment_proofs`)) === 0);

// ---- the private bucket
await as("postgres");
check("the proofs bucket exists, is private, takes JPG, PNG, and PDF up to 5 MB", JSON.stringify(await rows(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'payment-proofs'`)) === '[{"public":false,"file_size_limit":5242880,"allowed_mime_types":["image/jpeg","image/png","application/pdf"]}]');
await as("authenticated", BIMA);
await db.exec(`insert into storage.objects (bucket_id, name) values ('payment-proofs', 'orders/${B1.id}/bukti.png')`);
check("a buyer can upload to the folder of their own unpaid order", true);
await expectError("a buyer cannot upload to someone else's order folder", `insert into storage.objects (bucket_id, name) values ('payment-proofs', 'orders/${A3.id}/curang.png')`, RLS);
await expectError("a buyer cannot upload outside the orders folder", `insert into storage.objects (bucket_id, name) values ('payment-proofs', 'lain/${B1.id}/x.png')`, RLS);
await expectError("a buyer cannot upload straight into the bucket root", `insert into storage.objects (bucket_id, name) values ('payment-proofs', 'x.png')`, RLS);
await expectError("a buyer cannot upload to a folder that is no order", `insert into storage.objects (bucket_id, name) values ('payment-proofs', 'orders/00000000-0000-0000-0000-00000000dead/x.png')`, RLS);
check("a buyer reads their own files", (await count(`select 1 from storage.objects where bucket_id = 'payment-proofs'`)) === 1);
check("a buyer can neither replace nor delete a file (0 rows)", (await count(`update storage.objects set name = name || 'x' returning id`)) === 0 && (await count(`delete from storage.objects returning id`)) === 0);
await as("authenticated", ANA);
check("another buyer cannot see that file", (await count(`select 1 from storage.objects where bucket_id = 'payment-proofs'`)) === 0);
await expectError("no new file once the order is under review", `insert into storage.objects (bucket_id, name) values ('payment-proofs', 'orders/${A1.id}/lagi.png')`, RLS);
await as("anon");
check("anon sees no files", (await count(`select 1 from storage.objects where bucket_id = 'payment-proofs'`)) === 0);
await expectError("anon cannot upload a file", `insert into storage.objects (bucket_id, name) values ('payment-proofs', 'orders/${B1.id}/x.png')`, RLS);
await as("authenticated", ADMIN);
check("an admin reads every file", (await count(`select 1 from storage.objects where bucket_id = 'payment-proofs'`)) === 1);

// ---- running out of time: A2 (unpaid) and A1 (under review) are both past their deadline
await as("postgres");
await db.exec(`update public.orders set expires_at = now() - interval '1 minute' where id in ('${A2.id}', '${A1.id}')`);
await as("service_role");
check("the expiry job expires only the unpaid order that ran out of time", (await one(`select public.expire_overdue_orders() as n`)).n === 1);
await as("postgres");
check("A2 is expired; A1 (under review) and A3 (still in time) are not", (await status(A2.id)) === "expired" && (await status(A1.id)) === "under_review" && (await status(A3.id)) === "awaiting_payment");
check("exactly A2's stock (one mug) went back on sale", (await stock("mug")) === 3 && (await stock("tote")) === 0);
check("the history says it expired, by the system", JSON.stringify(await rows(`select event, actor_name from public.order_status_history where order_id = '${A2.id}' order by id desc limit 1`)) === '[{"event":"expired","actor_name":"Sistem"}]');
await as("service_role");
check("running the job again gives nothing back twice", (await one(`select public.expire_overdue_orders() as n`)).n === 0);
await as("postgres");
check("the stock is unchanged by the second run", (await stock("mug")) === 3);
await as("authenticated", ANA);
await expectError("an expired order takes no proof", `select public.submit_payment_proof('${A2.id}', 'orders/${A2.id}/x.png', 'image/png', 10)`, /not_payable/);

// An order past its deadline that the job has not seen yet: placing a new order gives its stock back first.
await as("postgres");
await db.exec(`update public.orders set expires_at = now() - interval '1 second' where id = '${B1.id}'`); // Bima's tote
const C1 = await placeAs(ANA, [{ product_id: 2, quantity: 1 }]);
check("placing an order first gives back the stock of orders that ran out of time, then takes it", typeof C1.number === "string" && (await stock("tote")) === 0);
check("the stale order was expired by that call", (await status(B1.id)) === "expired");

// ---- a rejected order can be paid again, for a limited time (A3 is Ana's, still awaiting payment)
// An unpaid order past its deadline that the job has not expired yet still takes no proof.
await db.exec(`update public.orders set expires_at = now() - interval '1 minute' where id = '${A3.id}'`);
await as("authenticated", ANA);
await expectError("an unpaid order past its deadline takes no proof, even before the job has expired it", `select public.submit_payment_proof('${A3.id}', 'orders/${A3.id}/telat.png', 'image/png', 99)`, /not_payable/);
await as("postgres");
await db.exec(`update public.orders set expires_at = now() + interval '1 hour' where id = '${A3.id}'`);
await db.exec(`update public.orders set payment_status = 'rejected', reupload_until = now() + interval '1 hour', payment_rejection_reason = 'Nominal salah' where id = '${A3.id}'`);
await as("authenticated", ANA);
check("a buyer can send new proof for a rejected order inside the window", (await one(`select public.submit_payment_proof('${A3.id}', 'orders/${A3.id}/ulang.png', 'image/png', 99) as s`)).s === "under_review");
await as("postgres");
check("sending new proof clears the rejection reason", (await one(`select payment_rejection_reason as r from public.orders where id = '${A3.id}'`)).r === null);
await db.exec(`update public.orders set payment_status = 'rejected', reupload_until = now() - interval '1 minute' where id = '${A3.id}'`);
await as("authenticated", ANA);
await expectError("a rejected order past its window takes no proof", `select public.submit_payment_proof('${A3.id}', 'orders/${A3.id}/ulang2.png', 'image/png', 99)`, /not_payable/);
await as("service_role");
await db.exec(`select public.expire_overdue_orders()`);
await as("postgres");
check("the expiry job also expires a rejected order past its window, and returns its stock", (await status(A3.id)) === "expired" && (await stock("tote")) === 1);

// ---- parents going away
const keep = (await one(`select id from public.orders where buyer_id = '${ANA}' limit 1`)).id;
await db.exec(`delete from auth.users where id = '${ANA}'`);
check("deleting a buyer's account keeps the order, without the buyer", (await one(`select buyer_id from public.orders where id = '${keep}'`)).buyer_id === null);

console.log(failed ? `\n${failed} FAILED` : "\nAll orders checks passed");
process.exit(failed ? 1 : 0);
