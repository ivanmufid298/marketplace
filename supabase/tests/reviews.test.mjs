// Runs the review migration on a real Postgres engine (PGlite, in-process) after the migrations it depends on, and
// checks what each role may and may not do. Run it with `npm run test:sql` after any change to a migration.
//
// It stands in for Supabase with a hand-made `auth` schema, so it proves the SQL, constraints, and privileges, not that
// the real project is configured the same way. Check the real project after applying.
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const PREREQUISITES = ["20261012061023_profiles_and_roles.sql", "20261012065146_revoke_rls_auto_enable_execute.sql", "20261013030000_catalog_products.sql"].map(read);
const REVIEWS = read("20261013080000_product_reviews.sql");

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
`);

const as = async (role, uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  if (role !== "postgres") await db.exec(`set role ${role};`);
};
const rows = async (sql) => (await db.query(sql)).rows;
const count = async (sql) => (await rows(sql)).length;
const expectError = async (name, sql, pattern) => {
  try { await db.exec(sql); check(name, false, "it succeeded"); }
  catch (e) { check(name, pattern.test(e.message), e.message.split("\n")[0]); }
};
/** A change that must not happen: refused with an error, or matching no row, both count as "did not change anything". */
const cannotChange = async (name, sql) => {
  try { check(name, (await count(sql)) === 0); }
  catch (e) { check(name, /row-level security/i.test(e.message), e.message.split("\n")[0]); }
};
const DENIED = /permission denied/i;
const RLS = /row-level security/i;
const CHECK = /violates check constraint/i;
const FK = /violates foreign key constraint/i;

for (const sql of PREREQUISITES) {
  try { await db.exec(sql); } catch (e) { check("a prerequisite migration runs", false, e.message); process.exit(1); }
}
try { await db.exec(REVIEWS); check("reviews migration runs", true); } catch (e) { check("reviews migration runs", false, e.message); process.exit(1); }
try { await db.exec(REVIEWS); check("reviews migration runs a second time (idempotent)", true); } catch (e) { check("reviews migration runs a second time (idempotent)", false, e.message); }

const ADMIN = "00000000-0000-0000-0000-0000000000ad", BUYER = "00000000-0000-0000-0000-0000000000b1";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@x.test', '{"full_name":"Admin"}'), ('${BUYER}', 'buyer@x.test', '{"full_name":"Buyer"}');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.categories (name, slug) values ('Rumah', 'rumah');
  insert into public.products (slug, name, category_id, price, stock, weight_gram, status) values
    ('mug', 'Mug', 1, 89000, 5, 350, 'active'),
    ('tote', 'Tote', 1, 129000, 5, 450, 'active'),
    ('draf', 'Draf', 1, 10000, 1, 100, 'draft');
  insert into public.product_reviews (product_id, author_name, rating, body, status) values
    (1, 'Nadia P.', 5, 'Cantik sekali', 'published'),
    (1, 'Sarah A.', 4, 'Bagus', 'published'),
    (1, 'Rudi', 1, 'Mengecewakan', 'hidden'),
    (3, 'Dina', 5, 'Review untuk draf', 'published');
`);

// ---- anonymous visitor
await as("anon");
check("anon sees only published reviews of products on sale", JSON.stringify((await rows(`select author_name from public.product_reviews order by id`)).map((r) => r.author_name)) === '["Nadia P.","Sarah A."]');
check("anon does not see a hidden review", (await count(`select 1 from public.product_reviews where status = 'hidden'`)) === 0);
check("anon does not see the reviews of a draft product", (await count(`select 1 from public.product_reviews where product_id = 3`)) === 0);
await expectError("anon cannot write a review", `insert into public.product_reviews (product_id, author_name, rating, body) values (1, 'X', 5, 'x')`, DENIED);
await expectError("anon cannot change a review", `update public.product_reviews set rating = 1`, DENIED);
await expectError("anon cannot delete a review", `delete from public.product_reviews`, DENIED);
const stat = (await rows(`select * from public.product_review_stats where product_id = 1`))[0];
check("the summary counts only published reviews", stat?.review_count === 2 && Number(stat.average_rating) === 4.5, JSON.stringify(stat));
check("the summary counts each star", stat?.star_5 === 1 && stat?.star_4 === 1 && stat?.star_3 === 0 && stat?.star_2 === 0 && stat?.star_1 === 0);
check("the summary has nothing for a product with no visible reviews", (await count(`select 1 from public.product_review_stats where product_id = 3`)) === 0);
check("a product with no reviews at all has no summary row", (await count(`select 1 from public.product_review_stats where product_id = 2`)) === 0);

// ---- signed-in buyer
await as("authenticated", BUYER);
check("buyer sees the same reviews as a visitor", (await count(`select 1 from public.product_reviews`)) === 2);
await expectError("buyer cannot write a review yet", `insert into public.product_reviews (product_id, user_id, author_name, rating, body) values (1, '${BUYER}', 'Buyer', 5, 'x')`, RLS);
await cannotChange("buyer cannot change a review", `update public.product_reviews set rating = 1 returning id`);
await cannotChange("buyer cannot delete a review", `delete from public.product_reviews returning id`);
check("buyer's summary matches the visitor's", (await rows(`select review_count from public.product_review_stats where product_id = 1`))[0]?.review_count === 2);

// ---- admin
await as("authenticated", ADMIN);
check("admin sees every review, hidden and draft ones too", (await count(`select 1 from public.product_reviews`)) === 4);
check("the summary still counts only published reviews for an admin", (await rows(`select review_count from public.product_review_stats where product_id = 1`))[0]?.review_count === 2);
await db.exec(`insert into public.product_reviews (product_id, author_name, rating, body) values (2, 'Admin Entry', 3, 'Ditambah admin')`);
check("admin can add a review", (await count(`select 1 from public.product_reviews where author_name = 'Admin Entry'`)) === 1);
check("a new review is published and unverified by default", JSON.stringify(await rows(`select status, is_verified from public.product_reviews where author_name = 'Admin Entry'`)) === '[{"status":"published","is_verified":false}]');
await db.exec(`update public.product_reviews set status = 'hidden' where author_name = 'Nadia P.'`);
check("admin can hide a review", (await rows(`select review_count from public.product_review_stats where product_id = 1`))[0]?.review_count === 1);
await db.exec(`update public.product_reviews set status = 'published' where author_name = 'Nadia P.'`);
const before = (await rows(`select updated_at from public.product_reviews where author_name = 'Sarah A.'`))[0].updated_at;
await new Promise((r) => setTimeout(r, 15));
await db.exec(`update public.product_reviews set body = 'Bagus sekali' where author_name = 'Sarah A.'`);
check("editing a review moves updated_at", (await rows(`select updated_at from public.product_reviews where author_name = 'Sarah A.'`))[0].updated_at > before);
await db.exec(`delete from public.product_reviews where author_name = 'Admin Entry'`);
check("admin can delete a review", (await count(`select 1 from public.product_reviews where author_name = 'Admin Entry'`)) === 0);

// ---- constraints (as the table's owner, so only the constraints can say no)
await as("postgres");
await expectError("a rating of 0 is refused", `insert into public.product_reviews (product_id, author_name, rating, body) values (1, 'X', 0, 'x')`, CHECK);
await expectError("a rating of 6 is refused", `insert into public.product_reviews (product_id, author_name, rating, body) values (1, 'X', 6, 'x')`, CHECK);
await db.exec(`insert into public.product_reviews (product_id, author_name, rating, body) values (1, 'Edge', 1, 'x'), (1, 'Edge', 5, 'x')`);
check("ratings 1 and 5 are accepted", true);
await expectError("an empty review text is refused", `insert into public.product_reviews (product_id, author_name, rating, body) values (1, 'X', 5, '')`, CHECK);
await expectError("a review text over 2000 characters is refused", `insert into public.product_reviews (product_id, author_name, rating, body) values (1, 'X', 5, '${"x".repeat(2001)}')`, CHECK);
await db.exec(`insert into public.product_reviews (product_id, author_name, rating, body) values (1, 'Long', 5, '${"x".repeat(2000)}')`);
check("a review text of exactly 2000 characters is accepted", true);
await expectError("an empty author name is refused", `insert into public.product_reviews (product_id, author_name, rating, body) values (1, '', 5, 'x')`, CHECK);
await expectError("an author name over 60 characters is refused", `insert into public.product_reviews (product_id, author_name, rating, body) values (1, '${"n".repeat(61)}', 5, 'x')`, CHECK);
await expectError("an unknown status is refused", `insert into public.product_reviews (product_id, author_name, rating, body, status) values (1, 'X', 5, 'x', 'pending')`, CHECK);
await expectError("a review for a product that does not exist is refused", `insert into public.product_reviews (product_id, author_name, rating, body) values (999, 'X', 5, 'x')`, FK);

// ---- what happens when the parent rows go away
await db.exec(`insert into public.product_reviews (product_id, user_id, author_name, rating, body) values (2, '${BUYER}', 'Buyer', 5, 'from an account')`);
await db.exec(`delete from auth.users where id = '${BUYER}'`);
check("deleting an account keeps its review, without the account", JSON.stringify(await rows(`select user_id from public.product_reviews where author_name = 'Buyer'`)) === '[{"user_id":null}]');
const reviewsOfTote = await count(`select 1 from public.product_reviews where product_id = 2`);
await db.exec(`delete from public.products where id = 2`);
check("deleting a product deletes its reviews", reviewsOfTote > 0 && (await count(`select 1 from public.product_reviews where product_id = 2`)) === 0);

console.log(failed ? `\n${failed} FAILED` : "\nAll reviews checks passed");
process.exit(failed ? 1 : 0);
