// Checks placing an order at a courier's price from a server-signed quote on a real Postgres engine (PGlite, in-process): the HMAC the database
// computes against known test vectors and against Node's own, every way a quote can be wrong, that the order is priced and addressed from the
// quote and the saved address rather than from what the browser sent, and that the old way (the shop's own rates) is untouched.
// Run it with `npm run test:sql` after any change to a migration.
import fs from "node:fs";
import crypto from "node:crypto";
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
const QUOTES = read("20261020060000_shipping_quote_orders.sql");

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
for (const [name, sql] of [["orders", ORDERS], ["payment-proofs bucket", BUCKET], ["order actions", ACTIONS], ["webp proofs", WEBP], ["reviews", REVIEWS], ["reviews from orders", FROM_ORDERS], ["notifications", NOTIFICATIONS], ["notifications resolved", RESOLVED], ["addresses", ADDRESSES], ["address destination", DESTINATION], ["shop settings", SETTINGS]]) {
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
// Supabase Vault, in miniature: where the secret is kept.
const SECRET = "a-long-random-secret-shared-by-the-server-and-the-database-0123456789";
await db.exec(`create schema vault; create table vault.decrypted_secrets (name text, decrypted_secret text);`);
await db.exec(`grant usage on schema vault to authenticated, anon, service_role;`);
const setSecret = (value) => db.exec(`delete from vault.decrypted_secrets; ${value === null ? "" : `insert into vault.decrypted_secrets values ('shipping_quote_secret', '${value}');`}`);
await setSecret(SECRET);

for (const run of ["", " a second time (idempotent)"]) {
  try { await db.exec(QUOTES); check(`the quote migration runs${run}`, true); } catch (e) { check(`the quote migration runs${run}`, false, e.message); process.exit(1); }
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sign = (payload, secret = SECRET) => { const body = b64u(JSON.stringify(payload)); return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`; };
const hex = async (sql) => (await one(sql)).h;

// ---- the HMAC the database computes (RFC 4231 test cases, and against Node's own)
check("HMAC test case 1 (a 20-byte key)", await hex(`select encode(public.hmac_sha256(decode(repeat('0b', 20), 'hex'), convert_to('Hi There', 'UTF8')), 'hex') as h`) === "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
check("HMAC test case 2 (a short text key)", await hex(`select encode(public.hmac_sha256(convert_to('Jefe', 'UTF8'), convert_to('what do ya want for nothing?', 'UTF8')), 'hex') as h`) === "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
check("HMAC test case 4 (a 25-byte key and a long message)", await hex(`select encode(public.hmac_sha256(decode('0102030405060708090a0b0c0d0e0f10111213141516171819', 'hex'), decode(repeat('cd', 50), 'hex')), 'hex') as h`) === "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b");
check("HMAC test case 6 (a key longer than the block is hashed first)", await hex(`select encode(public.hmac_sha256(decode(repeat('aa', 131), 'hex'), convert_to('Test Using Larger Than Block-Size Key - Hash Key First', 'UTF8')), 'hex') as h`) === "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54");
let allMatch = true;
for (const keyLength of [1, 31, 32, 63, 64, 65, 100, 200]) {
  for (const messageLength of [0, 1, 55, 56, 63, 64, 65, 300]) {
    const key = crypto.randomBytes(keyLength), message = crypto.randomBytes(messageLength);
    const mine = await hex(`select encode(public.hmac_sha256(decode('${key.toString("hex")}', 'hex'), decode('${message.toString("hex")}', 'hex')), 'hex') as h`);
    if (mine !== crypto.createHmac("sha256", key).update(message).digest("hex")) allMatch = false;
  }
}
check("it agrees with Node's HMAC for keys of 1 to 200 bytes and messages of 0 to 300", allMatch);

// ---- who may run what
await expectError("a buyer cannot run the HMAC themselves", (await as("authenticated", ANA), `select public.hmac_sha256('a', 'b')`), DENIED);
await expectError("a buyer cannot check a quote themselves", `select public.verify_shipping_quote('a.b')`, DENIED);
await as("anon");
await expectError("a visitor cannot place an order", `select public.place_order('[]'::jsonb, 'regular', 'a', '12345', 'a', 'a', '1', null, null)`, DENIED);
await as("postgres");

// ---- checking a quote
const NOW = Math.floor(Date.now() / 1000);
const quote = (over = {}) => ({ u: ANA, o: 17549, d: 17536, w: 1200, c: "sicepat", v: "REG", f: 8000, e: "1-2 day", x: NOW + 1800, ...over });
const verify = async (token, uid = ANA) => { await as("postgres", uid); try { return (await one(`select public.verify_shipping_quote(${token === null ? "null" : `'${token}'`}) as r`)).r; } finally { await as("postgres"); } };
const verifyFails = async (name, token, pattern, uid = ANA) => { try { await verify(token, uid); check(name, false, "it was accepted"); } catch (e) { check(name, pattern.test(e.message), e.message.split("\n")[0]); } };
const good = await verify(sign(quote()));
check("a quote the secret signed is accepted, and what it says comes back", good.u === ANA && good.o === 17549 && good.d === 17536 && good.w === 1200 && good.c === "sicepat" && good.v === "REG" && good.f === 8000 && good.e === "1-2 day");
await verifyFails("a quote signed with another secret is refused", sign(quote(), "another-secret"), /invalid_quote/);
const tamper = (change) => { const t = sign(quote()); const body = JSON.parse(Buffer.from(t.split(".")[0], "base64url").toString()); return `${b64u(JSON.stringify(change(body)))}.${t.split(".")[1]}`; };
for (const [what, change] of [["the price", (p) => ({ ...p, f: 1 })], ["the weight", (p) => ({ ...p, w: 100 })], ["the service", (p) => ({ ...p, v: "BEST" })], ["the courier", (p) => ({ ...p, c: "jne" })], ["the place", (p) => ({ ...p, d: 1 })], ["the owner", (p) => ({ ...p, u: BIMA })], ["the time", (p) => ({ ...p, x: p.x + 99999 })]]) {
  await verifyFails(`a quote with ${what} changed after signing is refused`, tamper(change), /invalid_quote/);
}
await verifyFails("a quote for someone else is refused, even though the signature is genuine", sign(quote({ u: BIMA })), /invalid_quote/);
await verifyFails("an expired quote is refused", sign(quote({ x: NOW - 1 })), /invalid_quote/);
await verifyFails("a quote that expires this very second is refused", sign(quote({ x: NOW })), /invalid_quote/);
const signed = sign(quote());
await verifyFails("a quote with a space in it is refused", `${signed.slice(0, 6)} ${signed.slice(6)}`, /invalid_quote/);
await verifyFails("a quote written with the usual base64 characters is refused", signed.replace(/-/g, "+").replace(/_/g, "/").replace(/\./, "."), /invalid_quote/);
await verifyFails("an empty quote is refused", "", /invalid_quote/);
await verifyFails("a quote without a signature is refused", signed.split(".")[0], /invalid_quote/);
await verifyFails("a quote with three parts is refused", `${signed}.${signed.split(".")[1]}`, /invalid_quote/);
await verifyFails("a missing quote is refused", null, /invalid_quote/);
await verifyFails("a signature cut short is refused", signed.slice(0, -2), /invalid_quote/);
const forged = (text) => { const body = b64u(text); return `${body}.${crypto.createHmac("sha256", SECRET).update(body).digest("base64url")}`; };
for (const [what, text] of [["not JSON", "not json"], ["a list", "[]"], ["a number", "5"], ["a quote with a text for a price", JSON.stringify({ ...quote(), f: "8000" })], ["a quote with a negative price", JSON.stringify({ ...quote(), f: -1 })], ["a quote with a price with decimals", JSON.stringify({ ...quote(), f: 8000.5 })], ["a quote with no place", JSON.stringify({ ...quote(), d: undefined })], ["a quote with a number for a courier", JSON.stringify({ ...quote(), c: 5 })], ["a quote with a number for a service", JSON.stringify({ ...quote(), v: 5 })], ["a quote with a number for the estimate", JSON.stringify({ ...quote(), e: 5 })], ["a quote with a number for an owner", JSON.stringify({ ...quote(), u: 5 })], ["a quote with an enormous price", JSON.stringify({ ...quote(), f: 1e20 })]]) {
  await verifyFails(`a genuinely signed ${what} is still refused`, forged(text), /invalid_quote/);
}
for (const field of ["u", "o", "d", "w", "c", "v", "f", "e", "x"]) {
  const without = { ...quote() }; delete without[field];
  await verifyFails(`a genuinely signed quote with no "${field}" is still refused`, forged(JSON.stringify(without)), /invalid_quote/);
  await verifyFails(`a genuinely signed quote with "${field}" empty (null) is still refused`, forged(JSON.stringify({ ...quote(), [field]: null })), /invalid_quote/);
}
for (const field of ["o", "d", "w", "f", "x"]) {
  await verifyFails(`a genuinely signed quote with "${field}" as text is still refused`, forged(JSON.stringify({ ...quote(), [field]: String(quote()[field]) })), /invalid_quote/);
}
await setSecret(null);
await verifyFails("a quote cannot be checked when there is no secret, and the reason is said", sign(quote()), /quote_unavailable/);
await setSecret("");
await verifyFails("an empty secret is no secret", sign(quote(), ""), /quote_unavailable/);
await setSecret(SECRET);
check("with the secret back, quotes are accepted again", (await verify(sign(quote()))).d === 17536);

// ---- placing an order with a quote
await db.exec(`update public.shop_settings set origin_destination_id = 17549, origin_label = 'KEBAYORAN LAMA SELATAN', couriers = array['jne', 'sicepat'] where id = 1;`);
const addr = async (uid, label, destination = true, over = {}) => {
  await as("authenticated", uid);
  const a = { recipient: "Ana Putri", phone: "0811000111", street: "Jl. Mawar 1 (dari buku)", city: "Kebayoran Baru, Jakarta Selatan", postcode: "12150", ...over };
  const r = await one(`insert into public.addresses (label, recipient_name, phone, address, city, postcode${destination ? ", destination_id, destination_label" : ""}) values ('${label}', '${a.recipient}', '${a.phone}', '${a.street}', '${a.city}', '${a.postcode}'${destination ? `, ${a.destination ?? 17536}, 'CIPETE UTARA, KEBAYORAN BARU'` : ""}) returning id`);
  await as("postgres");
  return r.id;
};
const ANA_ADDR = await addr(ANA, "Rumah");
const items = [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 1 }]; // 2 x 350 + 450 = 1150 g, priced as 1200
const placeSql = (token, addressId, its = items, typed = ["Orang Lain", "0899999999", "Jl. Palsu 9", "Papua", "99999"]) =>
  `select public.place_order('${JSON.stringify(its)}'::jsonb, 'regular', '${typed[0]}', '${typed[1]}', '${typed[2]}', '${typed[3]}', '${typed[4]}', ${token === null ? "null" : `'${token}'`}, ${addressId === null ? "null" : `'${addressId}'`}) as r`;
const placeAsBuyer = async (uid, sql) => { await as("authenticated", uid); try { return (await one(sql)).r; } finally { await as("postgres"); } };
const placeFails = async (name, uid, sql, pattern) => { await as("authenticated", uid); try { await db.exec(sql); check(name, false, "it succeeded"); } catch (e) { check(name, pattern.test(`${e.message} ${e.detail ?? ""}`), e.message.split("\n")[0]); } finally { await as("postgres"); } };
const stockOf = async () => (await rows(`select id, stock from public.products order by id`)).map((r) => r.stock).join();
const ordersOf = async (uid) => (await rows(`select * from public.orders where buyer_id = '${uid}' order by created_at, id`));

const stock0 = await stockOf();
const placed = await placeAsBuyer(ANA, placeSql(sign(quote()), ANA_ADDR));
const o = (await ordersOf(ANA))[0];
check("an order is placed at the quote's price, and the total is the goods plus that price", Number(o.shipping_fee) === 8000 && Number(o.subtotal) === 2 * 89000 + 129000 && Number(o.total) === 2 * 89000 + 129000 + 8000 && Number(placed.total) === Number(o.total));
check("it is labelled with the courier and the service, with a code that says it came from a quote", o.shipping_label === "SICEPAT REG" && o.shipping_code === "api:sicepat:reg");
check("what the price was made from is kept with the order: courier, service, estimate, place, and weight", o.shipping_courier === "sicepat" && o.shipping_service === "REG" && o.shipping_etd === "1-2 day" && Number(o.shipping_destination_id) === 17536 && o.shipping_weight_gram === 1200);
check("the order goes to the saved address, not to what the browser sent", o.recipient_name === "Ana Putri" && o.phone === "0811000111" && o.address === "Jl. Mawar 1 (dari buku)" && o.city === "Kebayoran Baru, Jakarta Selatan" && o.postcode === "12150");
check("stock was taken as usual", (await stockOf()) === stock0.split(",").map((s, i) => Number(s) - [2, 1][i]).join());
check("the buyer was told what to do, as with any order", (await count(`select 1 from public.notifications where order_id = '${placed.id}' and kind = 'payment_needed'`)) === 1);
const freeShipping = await placeAsBuyer(ANA, placeSql(sign(quote({ f: 0 })), ANA_ADDR));
check("a quote for free shipping is placed at nothing, still marked as from a quote", (await rows(`select shipping_fee, shipping_code from public.orders where id = '${freeShipping.id}'`)).every((r) => Number(r.shipping_fee) === 0 && r.shipping_code === "api:sicepat:reg"));

// ---- every way the order can be refused
const failures = [
  ["a quote that is not signed by the secret", sign(quote(), "x"), ANA_ADDR, items, /invalid_quote/],
  ["a quote that has expired", sign(quote({ x: NOW - 5 })), ANA_ADDR, items, /invalid_quote/],
  ["a quote for another buyer", sign(quote({ u: BIMA })), ANA_ADDR, items, /invalid_quote/],
  ["a quote for another place than the saved address's", sign(quote({ d: 99999 })), ANA_ADDR, items, /invalid_quote/],
  ["a quote whose shop place is not where the shop ships from now", sign(quote({ o: 11111 })), ANA_ADDR, items, /quote_stale/],
  ["a quote for a courier the shop does not offer", sign(quote({ c: "ninja" })), ANA_ADDR, items, /quote_stale/],
  ["a quote priced for a different weight", sign(quote({ w: 1100 })), ANA_ADDR, items, /quote_mismatch/],
  ["a quote priced for a heavier cart", sign(quote({ w: 1300 })), ANA_ADDR, items, /quote_mismatch/],
  ["a quote used for a different cart", sign(quote()), ANA_ADDR, [{ product_id: 1, quantity: 1 }], /quote_mismatch/],
];
for (const [name, token, addressId, its, pattern] of failures) {
  const before = { stock: await stockOf(), orders: (await ordersOf(ANA)).length };
  await placeFails(`${name} is refused`, ANA, placeSql(token, addressId, its), pattern);
  check(`and nothing was taken: no stock, no order (${name})`, (await stockOf()) === before.stock && (await ordersOf(ANA)).length === before.orders);
}
await placeFails("a quote without the saved address it is for is refused", ANA, placeSql(sign(quote()), null), /invalid_address/);
await placeFails("an address that is not there is refused", ANA, placeSql(sign(quote()), "00000000-0000-0000-0000-000000000000"), /invalid_address/);
const BIMA_ADDR = await addr(BIMA, "Rumah Bima");
await placeFails("someone else's saved address cannot be used", ANA, placeSql(sign(quote()), BIMA_ADDR), /invalid_address/);
const BY_HAND = await addr(ANA, "Manual", false);
await placeFails("an address saved by hand, with no place, cannot be priced by a quote", ANA, placeSql(sign(quote()), BY_HAND), /invalid_address/);
await placeFails("an order cannot be placed with a quote when there is no secret to check it", ANA, (await setSecret(null), placeSql(sign(quote()), ANA_ADDR)), /quote_unavailable/);
await setSecret(SECRET);

// ---- a quote only for what it was for
const countBefore = (await ordersOf(ANA)).length;
const price = async (uid, token, addressId) => { const r = await placeAsBuyer(uid, placeSql(token, addressId)); return r; };
await db.exec(`update public.orders set payment_status = 'expired' where buyer_id = '${ANA}'`);
const again = sign(quote({ x: NOW + 600 }));
await price(ANA, again, ANA_ADDR);
await price(ANA, again, ANA_ADDR);
check("the same quote can be used again for the same cart within its time, at the same price", (await ordersOf(ANA)).length === countBefore + 2 && (await ordersOf(ANA)).slice(-2).every((r) => Number(r.shipping_fee) === 8000));

// ---- the shop's own rates are untouched
await db.exec(`update public.orders set payment_status = 'expired' where buyer_id = '${ANA}'`);
const manual = await placeAsBuyer(ANA, `select public.place_order('${JSON.stringify(items)}'::jsonb, 'regular', 'Ana Putri', '0811000111', 'Jl. Tulisan 5', 'Jakarta', '12345') as r`);
const m = (await rows(`select * from public.orders where id = '${manual.id}'`))[0];
check("an order with the shop's own rate is placed as it always was, to the address that was sent, with no quote details", m.shipping_code === "regular" && Number(m.shipping_fee) === 18000 && m.address === "Jl. Tulisan 5" && m.shipping_courier === null && m.shipping_destination_id === null && m.shipping_weight_gram === null);
await placeFails("an unknown rate of the shop's is still refused", ANA, `select public.place_order('${JSON.stringify(items)}'::jsonb, 'nope', 'Ana', '0811000111', 'Jl', 'J', '1') as r`, /invalid_shipping/);
await db.exec(`update public.orders set payment_status = 'expired' where buyer_id = '${ANA}'`);
const withBook = await placeAsBuyer(ANA, `select public.place_order('${JSON.stringify(items)}'::jsonb, 'express', 'Ana Putri', '0811000111', 'Jl. Tulisan 6', 'Jakarta', '12345', null, '${ANA_ADDR}') as r`);
check("a saved address given without a quote changes nothing: the order goes where it was told, at the shop's rate", (await rows(`select address, shipping_fee from public.orders where id = '${withBook.id}'`)).every((r) => r.address === "Jl. Tulisan 6" && Number(r.shipping_fee) === 32000));

// ---- a quote with no estimate, and the checks every order has
await db.exec(`update public.orders set payment_status = 'expired' where buyer_id = '${ANA}'`);
const noEta = await placeAsBuyer(ANA, placeSql(sign(quote({ e: "" })), ANA_ADDR));
check("an empty estimate is kept as nothing, not as an empty text", (await rows(`select shipping_etd from public.orders where id = '${noEta.id}'`))[0].shipping_etd === null);
await db.exec(`update public.orders set payment_status = 'expired' where buyer_id = '${ANA}'`);
const manualWith = (name, phone, address, city, postcode) => `select public.place_order('${JSON.stringify(items)}'::jsonb, 'regular', '${name}', '${phone}', '${address}', '${city}', '${postcode}') as r`;
for (const [what, args] of [["an empty name", ["", "0811000111", "Jl", "Jakarta", "12345"]], ["a name over 120 characters", ["a".repeat(121), "0811000111", "Jl", "Jakarta", "12345"]], ["a phone under 5 characters", ["Ana", "0811", "Jl", "Jakarta", "12345"]], ["an address over 500 characters", ["Ana", "0811000111", "a".repeat(501), "Jakarta", "12345"]], ["a city over 100 characters", ["Ana", "0811000111", "Jl", "a".repeat(101), "12345"]], ["a postcode over 10 characters", ["Ana", "0811000111", "Jl", "Jakarta", "1".repeat(11)]]]) {
  const before = { stock: await stockOf(), orders: (await ordersOf(ANA)).length };
  await placeFails(`with the shop's own rates, ${what} is refused`, ANA, manualWith(...args), /invalid_address/);
  check(`and nothing was taken (${what})`, (await stockOf()) === before.stock && (await ordersOf(ANA)).length === before.orders);
}

console.log(failed ? `\n${failed} FAILED` : "\nAll shipping quote checks passed");
process.exit(failed ? 1 : 0);
