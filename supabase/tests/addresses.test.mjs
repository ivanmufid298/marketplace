// Checks the address book on a real Postgres engine (PGlite, in-process): who may read and change which address, that the
// first one is the default and there is only ever one, that deleting the default hands it on, the limit of 10, and the size
// limits that match an order's address. Run it with `npm run test:sql` after any change to a migration.
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const ADDRESSES = read("20261016040000_addresses.sql");
const DESTINATION = read("20261019040000_address_destination.sql");
const PREREQUISITES = [
  "20261012061023_profiles_and_roles.sql", "20261012065146_revoke_rls_auto_enable_execute.sql", 
].map(read);


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
for (const [name, sql] of [["addresses", ADDRESSES], ["address destination", DESTINATION]]) {
  for (const run of ["", " a second time (idempotent)"]) {
    try { await db.exec(sql); check(`the ${name} migration runs${run}`, true); } catch (e) { check(`the ${name} migration runs${run}`, false, e.message); process.exit(1); }
  }
}

const ANA = "00000000-0000-0000-0000-0000000000a1", BIMA = "00000000-0000-0000-0000-0000000000b1", ADMIN = "00000000-0000-0000-0000-0000000000ad";
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'), ('${BIMA}', 'bima@x.test', '{"full_name":"Bima"}'), ('${ADMIN}', 'admin@x.test', '{"full_name":"Siti"}');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
`);
const q = (s) => s.replace(/'/g, "''");
const add = (label, over = {}) => {
  const a = { recipient_name: "Ana Putri", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "", ...over };
  return `insert into public.addresses (label, recipient_name, phone, address, city, postcode, note${a.is_default === undefined ? "" : ", is_default"}) values ('${q(label)}', '${q(a.recipient_name)}', '${q(a.phone)}', '${q(a.address)}', '${q(a.city)}', '${q(a.postcode)}', '${q(a.note)}'${a.is_default === undefined ? "" : `, ${a.is_default}`}) returning id`;
};
const book = async (uid) => { await as("authenticated", uid); const r = await rows(`select id, label, is_default from public.addresses order by created_at, id`); await as("postgres"); return r; };
const defaults = (list) => list.filter((a) => a.is_default).map((a) => a.label).join(",");
const labels = (list) => list.map((a) => a.label).join(",");
const as_ = async (uid, sql) => { await as("authenticated", uid); try { return await db.query(sql); } finally { await as("postgres"); } };
const fails = async (name, uid, sql, pattern) => {
  await as("authenticated", uid);
  try { await db.exec(sql); check(name, false, "it succeeded"); }
  catch (e) { check(name, pattern.test(`${e.message} ${e.detail ?? ""}`), e.message.split("\n")[0]); }
  finally { await as("postgres"); }
};
const sleep = () => db.exec(`select pg_sleep(0.01)`);

// ---- the first address is the default
await as_(ANA, add("Rumah"));
check("the first address saved becomes the default, even if the app did not say so", defaults(await book(ANA)) === "Rumah");
await sleep();
await as_(ANA, add("Kantor"));
check("a second address is not the default", labels(await book(ANA)) === "Rumah,Kantor" && defaults(await book(ANA)) === "Rumah");
await sleep();
await as_(ANA, add("Kos", { is_default: false }));
check("an address saved as not-default stays so", defaults(await book(ANA)) === "Rumah");

// ---- choosing another default moves it
await sleep();
await as_(ANA, add("Orang tua", { is_default: true }));
check("saving an address as the default moves the default to it", defaults(await book(ANA)) === "Orang tua");
const kantor = (await book(ANA)).find((a) => a.label === "Kantor");
await as_(ANA, `update public.addresses set is_default = true where id = '${kantor.id}'`);
check("choosing another address as the default moves it, leaving exactly one", defaults(await book(ANA)) === "Kantor");

// ---- the default cannot be switched off, only moved
await as_(ANA, `update public.addresses set is_default = false where id = '${kantor.id}'`);
check("switching the default off does nothing: there is always one", defaults(await book(ANA)) === "Kantor");
await as_(ANA, `update public.addresses set label = 'Kantor baru', city = 'Bandung' where id = '${kantor.id}'`);
check("editing the default keeps it the default", defaults(await book(ANA)) === "Kantor baru" && (await one(`select city from public.addresses where id = '${kantor.id}'`)).city === "Bandung");

// ---- the database itself refuses a second default
await db.exec(`set session_replication_role = replica`);
await expectError("two defaults for one account cannot exist even with the rules switched off (the index itself refuses)", `update public.addresses set is_default = true where user_id = '${ANA}'`, /duplicate|unique/i);
await db.exec(`set session_replication_role = origin`);

// ---- deleting the default hands it on
const before = await book(ANA);
await as_(ANA, `delete from public.addresses where id = '${kantor.id}'`);
const afterDelete = await book(ANA);
check("deleting the default gives the default to the most recently saved address left", afterDelete.length === before.length - 1 && defaults(afterDelete) === "Orang tua", defaults(afterDelete));
await as_(ANA, `delete from public.addresses where label = 'Kos'`);
check("deleting an address that is not the default leaves the default alone", defaults(await book(ANA)) === "Orang tua" && (await book(ANA)).length === 2);
await as_(ANA, `delete from public.addresses`);
check("deleting the last address leaves an empty book", (await book(ANA)).length === 0);
await as_(ANA, add("Baru lagi"));
check("the next address saved to an empty book is the default again", defaults(await book(ANA)) === "Baru lagi");
await as_(ANA, `delete from public.addresses`);

// ---- the limit of 10
for (let i = 1; i <= 10; i++) await as_(ANA, add(`A${i}`));
check("ten addresses fit, with one default", (await book(ANA)).length === 10 && (await book(ANA)).filter((a) => a.is_default).length === 1);
await fails("an eleventh address is refused", ANA, add("A11"), /too_many_addresses/);
check("the refused address was not saved", (await book(ANA)).length === 10);
await as_(BIMA, add("Rumah Bima", { recipient_name: "Bima" }));
check("another account has its own count and its own default", (await book(BIMA)).length === 1 && defaults(await book(BIMA)) === "Rumah Bima" && (await book(ANA)).length === 10);
await as_(ANA, `delete from public.addresses where label = 'A10'`);
await as_(ANA, add("A11"));
check("room frees up after a delete", (await book(ANA)).length === 10);

// ---- only the owner reads and changes
check("a buyer does not see another buyer's addresses", (await book(BIMA)).every((a) => a.label === "Rumah Bima"));
// Statements with no WHERE, so what they may touch is decided by the change rules alone and not by what the buyer can read.
const anaBefore = JSON.stringify(await book(ANA)), anaCities = (await rows(`select city from public.addresses where user_id = '${ANA}' order by id`)).map((r) => r.city).join();
await as("authenticated", BIMA);
await db.exec(`update public.addresses set city = 'Diubah'`);
await db.exec(`delete from public.addresses where label <> 'Rumah Bima'`);
await db.exec(`delete from public.addresses`);
await as("postgres");
check("a buyer's blanket update or delete never reaches another buyer's addresses", JSON.stringify(await book(ANA)) === anaBefore && (await rows(`select city from public.addresses where user_id = '${ANA}' order by id`)).map((r) => r.city).join() === anaCities);
await as_(BIMA, add("Rumah Bima", { recipient_name: "Bima" }));
// Choosing a default as a superuser (which Row Level Security does not limit) must still only move that account's own default.
const bimaDefault = defaults(await book(BIMA));
const anaOther = (await book(ANA)).find((x) => !x.is_default);
await db.exec(`update public.addresses set is_default = true where id = '${anaOther.id}'`);
check("moving one account's default never touches another account's default", defaults(await book(BIMA)) === bimaDefault && (await book(ANA)).filter((x) => x.is_default).length === 1 && (await book(ANA)).find((x) => x.id === anaOther.id).is_default);
await as("authenticated", BIMA);
check("another buyer cannot change an address (0 rows)", (await count(`update public.addresses set city = 'X' where user_id = '${ANA}' returning id`)) === 0);
check("another buyer cannot delete an address (0 rows)", (await count(`delete from public.addresses where user_id = '${ANA}' returning id`)) === 0);
await expectError("an address cannot be saved into someone else's book", `insert into public.addresses (user_id, label, recipient_name, phone, address, city, postcode) values ('${ANA}', 'Curang', 'x', '12345', 'x', 'x', '1')`, DENIED);
await as("postgres");
check("an admin does not see a buyer's address book either", await (async () => { await as("authenticated", ADMIN); const n = await count(`select 1 from public.addresses`); await as("postgres"); return n === 0; })());
await as("anon");
await expectError("a visitor who is not signed in cannot read the book", `select * from public.addresses`, DENIED);
await expectError("a visitor who is not signed in cannot write the book", `insert into public.addresses (label, recipient_name, phone, address, city, postcode) values ('x','x','12345','x','x','1')`, DENIED);
await as("postgres");

// ---- an address never changes owner, and its owner column is not writable
await as_(ANA, `delete from public.addresses where label in ('A1','A2','A3')`);
await as("authenticated", ANA);
await expectError("the owner cannot hand an address to someone else", `update public.addresses set user_id = '${BIMA}' where label = 'A1'`, DENIED);
await as("postgres");
check("an address always starts in the signed-in account's own book", (await as_(ANA, add("Otomatis"))).rows.length === 1 && (await one(`select user_id from public.addresses where label = 'Otomatis'`)).user_id === ANA);

// ---- the same limits as an order's address
const tooBig = [
  ["a label longer than 30 characters", { label: "x".repeat(31) }], ["an empty label", { label: "" }],
  ["a recipient name longer than 120 characters", { recipient_name: "x".repeat(121) }], ["an empty recipient name", { recipient_name: "" }],
  ["a phone number shorter than 5 characters", { phone: "1234" }], ["a phone number longer than 30 characters", { phone: "1".repeat(31) }],
  ["an address longer than 500 characters", { address: "x".repeat(501) }], ["an empty address", { address: "" }],
  ["a city longer than 100 characters", { city: "x".repeat(101) }], ["an empty city", { city: "" }],
  ["a postcode longer than 10 characters", { postcode: "1".repeat(11) }], ["an empty postcode", { postcode: "" }],
  ["a note longer than 200 characters", { note: "x".repeat(201) }],
];
for (const [what, over] of tooBig) await fails(`${what} is refused`, ANA, add(over.label ?? "Uji", over), CHECK);
for (const [what, over, ok] of [["a label of exactly 30 characters", { label: "x".repeat(30) }], ["a phone of exactly 5 characters", { phone: "12345" }], ["a postcode of exactly 10 characters", { postcode: "1".repeat(10) }], ["a note of exactly 200 characters", { note: "x".repeat(200) }]]) {
  await db.exec(`delete from public.addresses where label = 'Batas'`);
  try { await as_(ANA, add("Batas", over.label ? { ...over } : over)); check(`${what} is accepted`, true); } catch (e) { check(`${what} is accepted`, false, e.message); }
  await db.exec(`delete from public.addresses where label = 'Batas' or label = '${over.label ?? ""}'`);
}

// ---- the place in the shipping provider's terms
await as_(ANA, `delete from public.addresses`);
await as_(ANA, `insert into public.addresses (label, recipient_name, phone, address, city, postcode, destination_id, destination_label) values ('Tujuan', 'Ana', '0811000111', 'Jl. Mawar 1', 'Kebayoran Baru, Jakarta Selatan', '12150', 17536, 'CIPETE UTARA, KEBAYORAN BARU, JAKARTA SELATAN, DKI JAKARTA, 12150')`);
const withPlace = await one(`select destination_id, destination_label from public.addresses where label = 'Tujuan'`);
check("an address keeps the provider's id for its place, with the name it was found under", Number(withPlace.destination_id) === 17536 && /^CIPETE UTARA/.test(withPlace.destination_label));
await as_(ANA, add("Tanpa tujuan"));
const without = await one(`select destination_id, destination_label from public.addresses where label = 'Tanpa tujuan'`);
check("an address saved by hand has no place", without.destination_id === null && without.destination_label === null);
await as_(ANA, `update public.addresses set destination_id = 99, destination_label = 'X, Y, Z' where label = 'Tanpa tujuan'`);
check("the owner can add a place to an address later", Number((await one(`select destination_id from public.addresses where label = 'Tanpa tujuan'`)).destination_id) === 99);
await as_(ANA, `update public.addresses set destination_id = null, destination_label = null where label = 'Tanpa tujuan'`);
check("and take it away again", (await one(`select destination_id from public.addresses where label = 'Tanpa tujuan'`)).destination_id === null);
await fails("an id without a name is refused", ANA, `update public.addresses set destination_id = 5, destination_label = null where label = 'Tanpa tujuan'`, CHECK);
await fails("a name without an id is refused", ANA, `update public.addresses set destination_id = null, destination_label = 'X' where label = 'Tanpa tujuan'`, CHECK);
await fails("an id of zero or less is refused", ANA, `update public.addresses set destination_id = 0, destination_label = 'X' where label = 'Tanpa tujuan'`, CHECK);
await fails("a name longer than 200 characters is refused", ANA, `update public.addresses set destination_id = 5, destination_label = '${"x".repeat(201)}' where label = 'Tanpa tujuan'`, CHECK);
await fails("an empty name is refused", ANA, `update public.addresses set destination_id = 5, destination_label = '' where label = 'Tanpa tujuan'`, CHECK);
check("a name of exactly 200 characters is accepted", await as_(ANA, `update public.addresses set destination_id = 5, destination_label = '${"x".repeat(200)}' where label = 'Tanpa tujuan'`).then(() => true, () => false));
check("another buyer cannot read the place of this buyer's address", await (async () => { await as("authenticated", BIMA); const n = await count(`select 1 from public.addresses where destination_id is not null`); await as("postgres"); return n === 0; })());
await db.exec(`delete from public.addresses where user_id = '${ANA}'`);

// ---- deleting the account deletes its book
const countBefore = await count(`select 1 from public.addresses where user_id = '${BIMA}'`);
await db.exec(`delete from auth.users where id = '${BIMA}'`);
check("deleting an account deletes its addresses", countBefore > 0 && (await count(`select 1 from public.addresses where user_id = '${BIMA}'`)) === 0);

console.log(failed ? `\n${failed} FAILED` : "\nAll address book checks passed");
process.exit(failed ? 1 : 0);
