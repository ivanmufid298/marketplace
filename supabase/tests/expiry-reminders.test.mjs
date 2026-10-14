// Checks the expiry reminders (and the schedule that runs the order clean-up) on a real Postgres engine (PGlite, in-process)
// after the migrations they depend on: who is reminded and when, that a reminder is sent once per deadline, that it goes away
// with the request it belongs to, and who may run the functions. Run it with `npm run test:sql` after any change to a migration.
//
// PGlite has no pg_cron, so the schedule migration is checked against a stand-in `cron.schedule` that records its calls: it
// proves what is scheduled and that running the migration twice is harmless, not that the real project runs the jobs.
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
const SCHEDULE = read("20261014070100_schedule_order_jobs.sql");

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


// ---- the schedule (against a stand-in for pg_cron)
await db.exec(`
  create schema cron;
  create table cron.job (name text primary key, schedule text not null, command text not null);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
    insert into cron.job values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
`);
const scheduleSql = SCHEDULE.replace(/create extension[^;]*;/i, "");
for (const run of ["", " a second time"]) {
  try { await db.exec(scheduleSql); check(`the schedule migration runs${run}`, true); } catch (e) { check(`the schedule migration runs${run}`, false, e.message); }
}
const jobs = await rows(`select name, schedule, command from cron.job order by name`);
check("exactly two jobs are scheduled, none twice", jobs.length === 2, JSON.stringify(jobs));
check("expired orders are cleaned up every minute", jobs.some((j) => j.name === "expire-overdue-orders" && j.schedule === "* * * * *" && /public\.expire_overdue_orders\(\)/.test(j.command)));
check("reminders go out every 5 minutes", jobs.some((j) => j.name === "remind-expiring-orders" && j.schedule === "*/5 * * * *" && /public\.remind_expiring_orders\(\)/.test(j.command)));
check("the real migration asks for the pg_cron extension", /create extension if not exists pg_cron with schema pg_catalog;/i.test(SCHEDULE));

// ---- who is reminded
const remind = async () => { await as("service_role"); const r = (await one(`select public.remind_expiring_orders() as n`)).n; await as("postgres"); return r; };
const setDeadline = (o, minutesLeft) => db.exec(`update public.orders set expires_at = now() + interval '${minutesLeft} minutes' where id = '${o.id}'`);
// A buyer may hold only a few unpaid orders at once, so every order here gets a buyer of its own.
let buyers = 0;
const fresh = async () => {
  const uid = `00000000-0000-0000-0000-0000000001${String(++buyers).padStart(2, "0")}`;
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'b${buyers}@x.test', '{"full_name":"B${buyers}"}')`);
  return { ...(await placeAs(uid)), uid };
};
const remindersOf = (o) => mine(o.uid, `kind = 'payment_expiring' and order_id = '${o.id}'`);

const early = await fresh();            // 120 minutes left: too early
const soon = await fresh();             // will have 20 minutes left
const late = await fresh();            // already past its deadline
const paying = await fresh();          // 10 minutes left but proof sent
await setDeadline(soon, 20);
await setDeadline(late, -5);
await setDeadline(paying, 10);
await proofFor(paying.uid, paying);
check("only the order that is close to its deadline is reminded", (await remind()) === 1);
let r = await remindersOf(soon);
check("the reminder names the order and its deadline, and is unread and unresolved", r.length === 1 && r[0].order_id === soon.id && r[0].payload.number === soon.number && Math.abs((new Date(r[0].payload.deadline) - Date.now()) / 60000 - 20) < 2 && r[0].read_at === null && r[0].resolved_at === null, JSON.stringify(r));
check("an order with plenty of time left is not reminded", (await remindersOf(early)).length === 0);
check("an order already past its deadline is not reminded (the clean-up deals with it)", (await remindersOf(late)).length === 0);
check("an order whose proof is already sent is not reminded", (await remindersOf(paying)).length === 0);

check("running it again reminds nobody twice", (await remind()) === 0 && (await remindersOf(soon)).length === 1);
await setDeadline(soon, 15);
check("moving the deadline within the same order does count as a new deadline", (await remind()) === 1 && (await remindersOf(soon)).length === 2);
await setDeadline(soon, 15);

// ---- the exact edges
const edgeIn = await fresh();
const edgeOut = await fresh();
await setDeadline(edgeIn, 29);
await setDeadline(edgeOut, 31);
await remind();
check("29 minutes left is reminded", (await remindersOf(edgeIn)).length === 1);
check("31 minutes left is not", (await remindersOf(edgeOut)).length === 0);

// ---- a rejected order gets its reminder for the second chance
const rejected = await fresh();
await proofFor(rejected.uid, rejected);
await admin(`select public.reject_payment('${rejected.id}', 'Buram')`);
await remind();
check("a rejected order is not reminded while it has plenty of time", (await remindersOf(rejected)).length === 0);
await db.exec(`update public.orders set reupload_until = now() + interval '25 minutes' where id = '${rejected.id}'`);
await remind();
r = await remindersOf(rejected);
check("a rejected order is reminded before its second chance runs out", r.length === 1 && Math.abs((new Date(r[0].payload.deadline) - Date.now()) / 60000 - 25) < 2, JSON.stringify(r));

const rejectedFar = await fresh();
await proofFor(rejectedFar.uid, rejectedFar);
await admin(`select public.reject_payment('${rejectedFar.id}', 'Buram')`);
await db.exec(`update public.orders set reupload_until = now() + interval '45 minutes' where id = '${rejectedFar.id}'`);
const rejectedLate = await fresh();
await proofFor(rejectedLate.uid, rejectedLate);
await admin(`select public.reject_payment('${rejectedLate.id}', 'Buram')`);
await db.exec(`update public.orders set reupload_until = now() - interval '5 minutes' where id = '${rejectedLate.id}'`);
await remind();
check("a rejected order with 45 minutes left is not reminded yet", (await remindersOf(rejectedFar)).length === 0);
check("a rejected order whose second chance already ran out is not reminded", (await remindersOf(rejectedLate)).length === 0);

// ---- the reminder goes away with the request
await proofFor(rejected.uid, rejected);
check("sending the new proof resolves the reminder too", (await remindersOf(rejected))[0].resolved_at !== null);

const direct = await fresh();
await setDeadline(direct, 10);
await remind();
await db.exec(`select public.resolve_notifications(array['${direct.id}']::uuid[], array['payment_rejected'])`);
check("resolving a rejection request resolves its reminder as well", (await remindersOf(direct)).every((n) => n.resolved_at !== null));
const unrelated = await fresh();
await setDeadline(unrelated, 10);
await remind();
await db.exec(`select public.resolve_notifications(array['${unrelated.id}']::uuid[], array['review_invite'])`);
check("resolving something unrelated leaves the reminder open", (await remindersOf(unrelated)).every((n) => n.resolved_at === null));

await proofFor(soon.uid, soon);
check("sending the proof resolves the reminders of that order", (await remindersOf(soon)).every((n) => n.resolved_at !== null && n.read_at !== null));

await admin(`select public.cancel_order('${edgeIn.id}', 'Salah pesan')`);
check("cancelling the order resolves its reminder", (await remindersOf(edgeIn)).every((n) => n.resolved_at !== null));

const lapsing = await fresh();
await setDeadline(lapsing, 5);
await remind();
check("a reminder is open until the deadline passes", (await remindersOf(lapsing)).every((n) => n.resolved_at === null));
await setDeadline(lapsing, -1);
await as("service_role");
await db.exec(`select public.expire_overdue_orders()`);
await as("postgres");
check("when the order expires the reminder is resolved and the buyer is told it expired", (await remindersOf(lapsing)).every((n) => n.resolved_at !== null) && (await count(`select 1 from public.notifications where order_id = '${lapsing.id}' and kind = 'order_expired'`)) === 1);
check("the expired order is marked expired", (await one(`select payment_status from public.orders where id = '${lapsing.id}'`)).payment_status === "expired");

// ---- cancelled orders and orders without a buyer
const cancelled = await fresh();
await setDeadline(cancelled, 10);
await admin(`select public.cancel_order('${cancelled.id}', 'Batal')`);
const beforeCancelled = await count(`select 1 from public.notifications where kind = 'payment_expiring'`);
await remind();
check("a cancelled order is never reminded", (await count(`select 1 from public.notifications where kind = 'payment_expiring'`)) === beforeCancelled);
const orphan = await fresh();
await db.exec(`update public.orders set buyer_id = null, expires_at = now() + interval '10 minutes' where id = '${orphan.id}'`);
await remind();
check("an order whose buyer is gone is not reminded", (await count(`select 1 from public.notifications where order_id = '${orphan.id}' and kind = 'payment_expiring'`)) === 0);

// ---- who may do what
await expectError("a buyer cannot run the reminder job", (await as("authenticated", ANA), `select public.remind_expiring_orders()`), DENIED);
await expectError("a visitor cannot run the reminder job", (await as("anon"), `select public.remind_expiring_orders()`), DENIED);
await as("postgres");
await expectError("a buyer cannot make a reminder up", (await as("authenticated", ANA), `insert into public.notifications (user_id, kind) values ('${ANA}', 'payment_expiring')`), DENIED);
await as("postgres");
await expectError("a buyer cannot resolve notifications through the helper", (await as("authenticated", ANA), `select public.resolve_notifications(array['${soon.id}']::uuid[], array['payment_needed'])`), DENIED);
await as("postgres");
check("the database accepts the new kind", await db.exec(`insert into public.notifications (user_id, kind) values ('${ANA}', 'payment_expiring')`).then(() => true, () => false));

console.log(failed ? `\n${failed} FAILED` : "\nAll expiry reminder checks passed");
process.exit(failed ? 1 : 0);
