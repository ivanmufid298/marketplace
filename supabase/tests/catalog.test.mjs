// Runs the catalog migrations (categories, products, product photos, and the Storage bucket policies) on a real Postgres
// engine (PGlite, in-process) after the profiles migrations they depend on, and checks what each role may and may not
// do. Run it with `npm run test:sql` after any change to a migration.
//
// It stands in for Supabase with a hand-made `auth` and `storage` schema, so it proves the SQL, constraints, and
// privileges, not that the real project is configured the same way. Check the real project after applying.
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const PROFILES = read("20261012061023_profiles_and_roles.sql");
const REVOKE_RLS_FN = read("20261012065146_revoke_rls_auto_enable_execute.sql");
const CATALOG = read("20261013030000_catalog_products.sql");
const BUCKET = read("20261013030100_product_images_bucket.sql");

const db = new PGlite();
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`); if (!ok) failed++; };

// ---- a stand-in for the parts of Supabase the migrations depend on
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
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
const DENIED = /permission denied/i;
const RLS = /row-level security/i;

// ---- migrations: profiles first, then the catalog; each runs twice
for (const [name, sql] of [["profiles", PROFILES], ["revoke rls_auto_enable", REVOKE_RLS_FN]]) {
  try { await db.exec(sql); } catch (e) { check(`${name} migration runs`, false, e.message); process.exit(1); }
}
for (const [name, sql] of [["catalog", CATALOG], ["bucket", BUCKET]]) {
  try { await db.exec(sql); check(`${name} migration runs`, true); } catch (e) { check(`${name} migration runs`, false, e.message); process.exit(1); }
  try { await db.exec(sql); check(`${name} migration runs a second time (idempotent)`, true); } catch (e) { check(`${name} migration runs a second time (idempotent)`, false, e.message); }
}

// ---- people and data
const ADMIN = "00000000-0000-0000-0000-0000000000ad", BUYER = "00000000-0000-0000-0000-0000000000b1";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@x.test', '{"full_name":"Admin"}'), ('${BUYER}', 'buyer@x.test', '{"full_name":"Buyer"}');
  update public.profiles set role = 'admin' where id = '${ADMIN}';

  insert into public.categories (name, slug, is_active) values ('Rumah', 'rumah', true), ('Lama', 'lama', false);
  insert into public.products (slug, name, category_id, price, stock, weight_gram, status) values
    ('mug', 'Mug', 1, 89000, 5, 350, 'active'),
    ('draf', 'Draf', 1, 10000, 1, 100, 'draft'),
    ('arsip', 'Arsip', 1, 20000, 1, 100, 'archived');
  insert into public.product_images (product_id, object_key) values (1, 'products/1/a'), (2, 'products/2/a'), (3, 'products/3/a');
`);

// ---- anonymous visitor
await as("anon");
check("anon sees only the active product", JSON.stringify((await rows(`select slug from public.products order by id`)).map((r) => r.slug)) === '["mug"]');
check("anon reading products does not trip over is_admin()", true); // the query above would have thrown "permission denied for function"
check("anon sees only active categories", JSON.stringify((await rows(`select slug from public.categories`)).map((r) => r.slug)) === '["rumah"]');
check("anon sees photos of active products only", JSON.stringify((await rows(`select object_key from public.product_images`)).map((r) => r.object_key)) === '["products/1/a"]');
await expectError("anon cannot insert a product", `insert into public.products (slug, name, category_id, price, weight_gram) values ('x','X',1,1,1)`, DENIED);
await expectError("anon cannot update a product", `update public.products set price = 1`, DENIED);
await expectError("anon cannot insert a category", `insert into public.categories (name, slug) values ('Z','z')`, DENIED);
await expectError("anon cannot insert a photo row", `insert into public.product_images (product_id, object_key) values (1, 'k')`, DENIED);
await expectError("anon cannot upload to the bucket", `insert into storage.objects (bucket_id, name) values ('product-images', 'products/1/x')`, RLS);

// ---- signed-in buyer
await as("authenticated", BUYER);
check("buyer sees only the active product", (await count(`select 1 from public.products`)) === 1);
check("buyer sees only active categories", (await count(`select 1 from public.categories`)) === 1);
check("buyer does not see draft or archived photos", (await count(`select 1 from public.product_images`)) === 1);
await expectError("buyer cannot insert a product", `insert into public.products (slug, name, category_id, price, weight_gram) values ('x','X',1,1,1)`, RLS);
check("buyer cannot update a product (0 rows)", (await count(`update public.products set price = 1 returning id`)) === 0);
await expectError("buyer cannot delete a product (no privilege)", `delete from public.products`, DENIED);
await expectError("buyer cannot insert a category", `insert into public.categories (name, slug) values ('Z','z')`, RLS);
check("buyer cannot delete a category (0 rows)", (await count(`delete from public.categories returning id`)) === 0);
await expectError("buyer cannot insert a photo row", `insert into public.product_images (product_id, object_key) values (1, 'k')`, RLS);
check("buyer cannot delete a photo row (0 rows)", (await count(`delete from public.product_images returning id`)) === 0);
await expectError("buyer cannot upload to the bucket", `insert into storage.objects (bucket_id, name) values ('product-images', 'products/1/x')`, RLS);
check("buyer cannot list the bucket", (await count(`select 1 from storage.objects`)) === 0);

// ---- admin
await as("authenticated", ADMIN);
check("admin sees every product", (await count(`select 1 from public.products`)) === 3);
check("admin sees every category", (await count(`select 1 from public.categories`)) === 2);
check("admin sees every photo row", (await count(`select 1 from public.product_images`)) === 3);
await db.exec(`insert into public.categories (name, slug, sort_order) values ('Fashion', 'fashion', 2)`);
check("admin can add a category", (await count(`select 1 from public.categories where slug = 'fashion'`)) === 1);
await db.exec(`insert into public.products (slug, name, category_id, price, compare_at_price, stock, weight_gram, badge, status) values ('tote', 'Tote', (select id from public.categories where slug = 'fashion'), 129000, 169000, 1, 450, 'Lokal', 'active')`);
check("admin can add a product", (await count(`select 1 from public.products where slug = 'tote'`)) === 1);
check("a new product defaults to draft when no status is given", (await rows(`insert into public.products (slug, name, category_id, price, weight_gram) values ('baru','Baru',1,1000,100) returning status`))[0].status === "draft");
await db.exec(`insert into public.product_images (product_id, object_key, alt, width, height) values ((select id from public.products where slug = 'tote'), 'products/4/a', 'Tote', 1600, 1200)`);
check("admin can add a photo row", (await count(`select 1 from public.product_images where object_key = 'products/4/a'`)) === 1);
const before = (await rows(`select updated_at from public.products where slug = 'tote'`))[0].updated_at;
await new Promise((r) => setTimeout(r, 15));
await db.exec(`update public.products set status = 'archived' where slug = 'tote'`);
check("admin can archive a product", (await rows(`select status from public.products where slug = 'tote'`))[0].status === "archived");
check("updated_at moves on update", new Date((await rows(`select updated_at from public.products where slug = 'tote'`))[0].updated_at) > new Date(before));
await expectError("admin cannot delete a product (archive instead)", `delete from public.products where slug = 'tote'`, DENIED);
await expectError("admin cannot delete a category that has products", `delete from public.categories where slug = 'rumah'`, /foreign key|violates/i);
check("admin can delete a photo row", (await count(`delete from public.product_images where object_key = 'products/4/a' returning id`)) === 1);
await db.exec(`insert into storage.objects (bucket_id, name) values ('product-images', 'products/1/x.webp')`);
check("admin can upload to the product bucket", (await count(`select 1 from storage.objects where name = 'products/1/x.webp'`)) === 1);
await expectError("admin cannot write to another bucket through these policies", `insert into storage.objects (bucket_id, name) values ('other', 'a')`, /row-level security|foreign key/i);
check("admin can remove a file from the product bucket", (await count(`delete from storage.objects where name = 'products/1/x.webp' returning id`)) === 1);

// ---- constraints (checked as admin, so RLS is not what stops these)
const base = (over = {}) => ({ slug: "ok", name: "Ok", cat: 1, price: 1000, compare: "null", stock: 1, weight: 100, status: "draft", badge: "null", ...over });
const insertProduct = (o) => { const p = base(o); return `insert into public.products (slug, name, category_id, price, compare_at_price, stock, weight_gram, status, badge) values ('${p.slug}', '${p.name}', ${p.cat}, ${p.price}, ${p.compare}, ${p.stock}, ${p.weight}, '${p.status}', ${p.badge})`; };
await expectError("rejects a negative price", insertProduct({ slug: "c1", price: -1 }), /check/i);
await expectError("rejects a compare-at price that is not higher than the price", insertProduct({ slug: "c2", compare: 1000 }), /check/i);
await expectError("rejects negative stock", insertProduct({ slug: "c3", stock: -1 }), /check/i);
await expectError("rejects zero weight (needed for shipping rates)", insertProduct({ slug: "c4", weight: 0 }), /check/i);
await expectError("rejects a missing weight", `insert into public.products (slug, name, category_id, price) values ('c5','C5',1,1)`, /not-null|null value/i);
await expectError("rejects an unknown status", insertProduct({ slug: "c6", status: "dijual" }), /check/i);
await expectError("rejects an uppercase slug", insertProduct({ slug: "Mug" }), /check/i);
await expectError("rejects a slug with spaces", insertProduct({ slug: "dua kata" }), /check/i);
await expectError("rejects a duplicate slug", insertProduct({ slug: "mug" }), /duplicate|unique/i);
await expectError("rejects an unknown category", insertProduct({ slug: "c7", cat: 999 }), /foreign key|violates/i);
await expectError("rejects an empty badge", insertProduct({ slug: "c8", badge: "''" }), /check/i);
await expectError("rejects a duplicate category name regardless of case", `insert into public.categories (name, slug) values ('rUmAh', 'rumah-2')`, /duplicate|unique/i);
await expectError("rejects a duplicate photo key", `insert into public.product_images (product_id, object_key) values (1, 'products/1/a')`, /duplicate|unique/i);
await expectError("rejects a photo for a product that does not exist", `insert into public.product_images (product_id, object_key) values (999, 'products/999/a')`, /foreign key|violates/i);
await expectError("rejects a zero photo width", `insert into public.product_images (product_id, object_key, width) values (1, 'products/1/b', 0)`, /check/i);

// ---- storage bucket settings, and cascade (needs a privileged role)
await as("postgres");
const bucket = (await rows(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'product-images'`))[0];
check("bucket is public", bucket?.public === true);
check("bucket limits files to 2 MB", Number(bucket?.file_size_limit) === 2097152);
check("bucket accepts only WebP and JPEG", JSON.stringify(bucket?.allowed_mime_types) === '["image/webp","image/jpeg"]');
await db.exec(`delete from public.products where slug = 'arsip'`);
check("deleting a product (as owner) removes its photo rows", (await count(`select 1 from public.product_images where product_id = 3`)) === 0);

// ---- indexes exist where the queries need them
const idx = (await rows(`select indexname from pg_indexes where schemaname = 'public'`)).map((r) => r.indexname);
for (const name of ["products_category_id_idx", "products_active_order_idx", "product_images_product_order_idx", "products_slug_key", "categories_slug_key"]) check(`index ${name} exists`, idx.includes(name));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
