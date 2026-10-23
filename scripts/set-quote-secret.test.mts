// Run with `npm test`. The pieces of the script that puts the shipping quote secret into the Vault: reading it from .env.local without
// mistakes, and writing SQL it cannot break out of.
import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error a plain .mjs script with no type declarations
import { buildVaultSql, CHECK_SQL, describeCheck, MIN_SECRET_LENGTH, readEnvValue } from "./set-quote-secret.mjs";

test("reads a value from an env file, with or without quotes", () => {
  assert.equal(readEnvValue("A=1\nSHIPPING_QUOTE_SECRET=abc==\nB=2", "SHIPPING_QUOTE_SECRET"), "abc==");
  assert.equal(readEnvValue('SHIPPING_QUOTE_SECRET="abc"', "SHIPPING_QUOTE_SECRET"), "abc");
  assert.equal(readEnvValue("SHIPPING_QUOTE_SECRET='abc'", "SHIPPING_QUOTE_SECRET"), "abc");
  assert.equal(readEnvValue("  SHIPPING_QUOTE_SECRET = abc  \r\n", "SHIPPING_QUOTE_SECRET"), "abc");
});
test("keeps = signs inside the value, and the last line wins", () => {
  assert.equal(readEnvValue("S=a=b=c", "S"), "a=b=c");
  assert.equal(readEnvValue("S=one\nS=two", "S"), "two");
});
test("ignores comments and other names, even ones that start with the same letters", () => {
  assert.equal(readEnvValue("# S=hidden\nSS=other", "S"), null);
  assert.equal(readEnvValue("", "S"), null);
});
test("the SQL stores the value under the name the database reads, replacing an earlier one", () => {
  const sql = buildVaultSql("a-very-long-secret-value-0123456789abcdef");
  assert.match(sql, /^delete from vault\.secrets where name = 'shipping_quote_secret';/);
  assert.match(sql, /vault\.create_secret\('a-very-long-secret-value-0123456789abcdef', 'shipping_quote_secret'/);
});
test("a quote in the value cannot end the string early", () => {
  const sql = buildVaultSql("x'); drop table public.orders; --");
  assert.ok(sql.includes("create_secret('x''); drop table public.orders; --', 'shipping_quote_secret'"));
});
test("the check reads only how many secrets there are and how long, never the value", () => {
  assert.ok(!CHECK_SQL.includes("select decrypted_secret"));
  assert.match(CHECK_SQL, /count\(\*\) as secrets/);
  assert.match(CHECK_SQL, /length\(decrypted_secret\)/);
  assert.equal(MIN_SECRET_LENGTH, 32);
});

test("reads the check's answer from the CLI's JSON, with or without notices around it, and numbers or text for the counts", () => {
  const json = JSON.stringify({ boundary: "b", rows: [{ length: 64, secrets: 1 }], warning: "w" }, null, 2);
  assert.equal(describeCheck(json), "secrets: 1  length: 64");
  assert.equal(describeCheck(`Initialising login role...\n${json}\nA new version is available`), "secrets: 1  length: 64");
  assert.equal(describeCheck(JSON.stringify({ rows: [{ length: "0", secrets: "0" }] })), "secrets: 0  length: 0");
});
test("says nothing it cannot read: no JSON, no rows, or rows without the two numbers", () => {
  for (const output of ["", "no braces here", "{ not json }", JSON.stringify({ rows: [] }), JSON.stringify({}), JSON.stringify({ rows: [{ secrets: 1 }] }), JSON.stringify({ rows: [{ secrets: "x", length: 2 }] })]) assert.equal(describeCheck(output), null);
});

test("reads the check's answer from the table the CLI prints in a terminal", () => {
  const table = "Project: x\n┌─────────┬────────┐\n│ secrets │ length │\n├─────────┼────────┤\n│ 1       │ 64     │\n└─────────┴────────┘\n";
  assert.equal(describeCheck(table), "secrets: 1  length: 64");
  assert.equal(describeCheck(table.replace("│ 1       │ 64     │", "│ 0       │ 0      │")), "secrets: 0  length: 0");
  assert.equal(describeCheck("┌─────────┬────────┐\n│ secrets │ length │\n└─────────┴────────┘"), null);
});
