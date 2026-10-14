// Runs the migration that lets buyers review what they bought (after the order, review, and order action migrations) on a real Postgres engine (PGlite, in-process) after the migrations they depend on, and
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
const MERGED = read("20261014110000_merge_review_select_policies.sql");

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
for (const [name, sql] of [["orders", ORDERS], ["payment-proofs bucket", BUCKET], ["order actions", ACTIONS], ["webp proofs", WEBP], ["reviews", REVIEWS], ["reviews from orders", FROM_ORDERS], ["merged review read policy", MERGED]]) {
  try { await db.exec(sql); check(`${name} migration runs`, true); } catch (e) { check(`${name} migration runs`, false, e.message); process.exit(1); }
  try { await db.exec(sql); check(`${name} migration runs a second time (idempotent)`, true); } catch (e) { check(`${name} migration runs a second time (idempotent)`, false, e.message); }
}

const ADMIN = "00000000-0000-0000-0000-0000000000ad", ANA = "00000000-0000-0000-0000-0000000000a1", BIMA = "00000000-0000-0000-0000-0000000000b1";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@x.test', '{"full_name":"Siti Admin"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'), ('${BIMA}', 'bima@x.test', '{"full_name":"Bima"}');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.categories (name, slug) values ('Rumah', 'rumah');
  insert into public.products (slug, name, category_id, price, stock, weight_gram, status) values ('mug', 'Mug', 1, 89000, 20, 350, 'active'), ('tote', 'Tote', 1, 129000, 20, 450, 'active');
`);
const place = (uid, items, name = "Ana Putri") => `select public.place_order('${JSON.stringify(items)}'::jsonb, 'regular', '${name}', '0811000111', 'Jl. Mawar 1', 'Jakarta', '12345') as r`;
const placeAs = async (uid, items, name) => { await as("authenticated", uid); const r = (await one(place(uid, items, name))).r; await as("postgres"); return r; };
const proofFor = async (uid, o) => { await as("authenticated", uid); await db.exec(`select public.submit_payment_proof('${o.id}', 'orders/${o.id}/b-${Math.random().toString(36).slice(2)}.png', 'image/png', 100)`); await as("postgres"); };
const accept = async (o) => { await as("authenticated", ADMIN); await db.exec(`select public.accept_payment('${o.id}')`); await as("postgres"); };
const receive = async (uid, o) => { await as("authenticated", uid); await db.exec(`select public.confirm_received('${o.id}')`); await as("postgres"); };
/** An order that is paid and confirmed received: its items can be reviewed. */
const completed = async (uid, items, name) => { const o = await placeAs(uid, items, name); await proofFor(uid, o); await accept(o); await receive(uid, o); return o; };
const itemOf = async (o, slug) => (await one(`select oi.id from public.order_items oi where oi.order_id = '${o.id}' and oi.product_slug = '${slug}'`)).id;
const review = (item, rating, body) => `select public.submit_review(${item}, ${rating}, ${body === null ? "null" : `'${body}'`}) as id`;

const DONE = await completed(ANA, [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }]);
const mugItem = await itemOf(DONE, "mug"), toteItem = await itemOf(DONE, "tote");

// ---- who may call it
await as("anon");
await expectError("anon cannot write a review", review(mugItem, 5, "Bagus"), DENIED);
await as("authenticated", BIMA);
await expectError("another buyer cannot review someone else's item (it looks like it does not exist)", review(mugItem, 5, "Bagus"), /item_not_found/);
await expectError("an item that does not exist is not found", review(999999, 5, "Bagus"), /item_not_found/);
await as("authenticated", ADMIN);
await expectError("an admin is not the buyer either", review(mugItem, 5, "Bagus"), /item_not_found/);

// ---- writing a review
await as("authenticated", ANA);
const id = (await one(review(mugItem, 5, "  Cantik sekali  "))).id;
await as("postgres");
const written = await one(`select * from public.product_reviews where id = ${id}`);
check("the review is attached to the product, the buyer, and the bought item", written.product_id === 1 && written.user_id === ANA && written.order_item_id === mugItem);
check("it is verified, published, and keeps the trimmed text and rating", written.is_verified === true && written.status === "published" && written.body === "Cantik sekali" && written.rating === 5);
check("it is signed with the name given at checkout", written.author_name === "Ana Putri");
await as("anon");
check("a visitor sees it on the product", (await count(`select 1 from public.product_reviews where order_item_id = ${mugItem}`)) === 1);
check("the product's summary counts it", (await one(`select review_count, average_rating from public.product_review_stats where product_id = 1`)).review_count === 1);

// ---- editing keeps one review per item
await as("authenticated", ANA);
check("writing again for the same item edits the review and returns the same id", (await one(review(mugItem, 3, "Ternyata biasa saja"))).id === id);
await as("postgres");
check("so there is still one review, with the new rating and text", (await count(`select 1 from public.product_reviews where order_item_id = ${mugItem}`)) === 1 && JSON.stringify(await rows(`select rating, body from public.product_reviews where id = ${id}`)) === '[{"rating":3,"body":"Ternyata biasa saja"}]');
check("editing moves updated_at", (await one(`select updated_at > created_at as moved from public.product_reviews where id = ${id}`)).moved === true);

// ---- refusals
await as("authenticated", ANA);
await expectError("a rating of 0 is refused", review(toteItem, 0, "x"), /invalid_rating/);
await expectError("a rating of 6 is refused", review(toteItem, 6, "x"), /invalid_rating/);
await expectError("a missing rating is refused", `select public.submit_review(${toteItem}, null, 'x')`, /invalid_rating/);
await expectError("an empty review is refused", review(toteItem, 5, "   "), /invalid_review/);
await expectError("a missing review text is refused", review(toteItem, 5, null), /invalid_review/);
await expectError("a review over 2000 characters is refused", review(toteItem, 5, "x".repeat(2001)), /invalid_review/);
await db.exec(review(toteItem, 1, "x".repeat(2000)));
check("ratings 1 and a text of exactly 2000 characters are accepted", true);
await db.exec(review(toteItem, 5, "Mantap"));
check("rating 5 is accepted", true);

// ---- only a completed order can be reviewed
const unpaid = await placeAs(BIMA, [{ product_id: 1, quantity: 1 }]);
await as("authenticated", BIMA);
await expectError("an order that is not paid cannot be reviewed", review(await itemOf(unpaid, "mug"), 5, "x"), /not_reviewable/);
await proofFor(BIMA, unpaid);
await as("authenticated", BIMA);
await expectError("an order whose proof is still being checked cannot be reviewed", review(await itemOf(unpaid, "mug"), 5, "x"), /not_reviewable/);
await accept(unpaid);
await as("authenticated", BIMA);
await expectError("a paid order the buyer has not confirmed received cannot be reviewed", review(await itemOf(unpaid, "mug"), 5, "x"), /not_reviewable/);
await receive(BIMA, unpaid);
await as("authenticated", BIMA);
await db.exec(review(await itemOf(unpaid, "mug"), 4, "Sesuai"));
check("once the buyer confirms receipt, the same order can be reviewed", true);

const cancelled = await completed(BIMA, [{ product_id: 2, quantity: 1 }], "Bima Aja");
await as("postgres");
await db.exec(`update public.orders set cancelled_at = now(), cancel_note = 'x' where id = '${cancelled.id}'`);
await as("authenticated", BIMA);
await expectError("a cancelled order cannot be reviewed", review(await itemOf(cancelled, "tote"), 5, "x"), /not_reviewable/);
await as("postgres");
const gone = await completed(BIMA, [{ product_id: 1, quantity: 1 }], "Bima Dua");
await db.exec(`update public.order_items set product_id = null where order_id = '${gone.id}'`);
await as("authenticated", BIMA);
await expectError("an item whose product is gone cannot be reviewed", review(await itemOf(gone, "mug"), 5, "x"), /not_reviewable/);

// ---- moderation
await as("authenticated", ADMIN);
await db.exec(`update public.product_reviews set status = 'hidden' where id = ${id}`);
await as("anon");
check("a hidden review is gone from the product page", (await count(`select 1 from public.product_reviews where order_item_id = ${mugItem}`)) === 0);
await as("authenticated", ANA);
check("but its author still reads it", (await count(`select 1 from public.product_reviews where order_item_id = ${mugItem}`)) === 1);
await db.exec(review(mugItem, 2, "Edit setelah disembunyikan"));
await as("postgres");
check("editing a hidden review does not bring it back", (await one(`select status from public.product_reviews where id = ${id}`)).status === "hidden");
await as("authenticated", BIMA);
check("another buyer cannot read a hidden review", (await count(`select 1 from public.product_reviews where id = ${id}`)) === 0);

// ---- reading and writing the table directly
await as("authenticated", ANA);
check("a buyer sees no one else's hidden review", (await count(`select 1 from public.product_reviews where status = 'hidden' and user_id is distinct from '${ANA}'`)) === 0);
await expectError("a buyer cannot write the table directly", `insert into public.product_reviews (product_id, user_id, author_name, rating, body, is_verified) values (1, '${ANA}', 'Ana', 5, 'langsung', true)`, RLS);
check("a buyer cannot edit a review directly (0 rows)", (await count(`update public.product_reviews set rating = 1 returning id`)) === 0);
check("a buyer cannot delete a review directly (0 rows)", (await count(`delete from public.product_reviews returning id`)) === 0);
await as("authenticated", ADMIN);
check("an admin still reads every review, hidden ones too", (await count(`select 1 from public.product_reviews`)) >= 3);

// ---- an admin deleting a review for good
await as("authenticated", ADMIN);
check("an admin can delete a buyer's review", (await count(`delete from public.product_reviews where id = ${id} returning id`)) === 1);
await as("authenticated", ANA);
check("the author no longer sees it", (await count(`select 1 from public.product_reviews where order_item_id = ${mugItem}`)) === 0);
await db.exec(review(mugItem, 4, "Ulasan baru setelah dihapus"));
await as("postgres");
const rewritten = await one(`select id, rating, status, is_verified from public.product_reviews where order_item_id = ${mugItem}`);
check("the buyer can write a new one for the same item, published and verified", rewritten && rewritten.id !== id && rewritten.rating === 4 && rewritten.status === "published" && rewritten.is_verified === true);

// ---- one review per item, and a deleted item keeps its review
await as("postgres");
await expectError("two reviews for one item are refused by the table itself", `insert into public.product_reviews (product_id, order_item_id, author_name, rating, body) values (1, ${mugItem}, 'x', 5, 'dobel')`, /unique|duplicate/i);
await db.exec(`insert into public.product_reviews (product_id, author_name, rating, body) values (1, 'Admin', 5, 'a'), (1, 'Admin', 5, 'b')`);
check("reviews an admin entered by hand (no item) can be many", true);
await db.exec(`delete from public.order_items where id = ${toteItem}`);
check("deleting the order item keeps its review, without the link", (await one(`select order_item_id from public.product_reviews where product_id = 2 and user_id = '${ANA}'`)).order_item_id === null);

// ---- one read rule per role (the linter flags two permissive policies for the same role and action)
const selectPolicies = await rows(`select roles::text as roles, count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'product_reviews' and cmd = 'SELECT' group by roles::text order by roles::text`);
check("signed-in people and visitors each have exactly one read rule on reviews", selectPolicies.length === 2 && selectPolicies.every((p) => p.n === 1), JSON.stringify(selectPolicies));

console.log(failed ? `\n${failed} FAILED` : "\nAll review-from-order checks passed");
process.exit(failed ? 1 : 0);
