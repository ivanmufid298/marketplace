#!/usr/bin/env node
// Puts SHIPPING_QUOTE_SECRET (from .env.local) into the Supabase Vault of the project linked in another folder, without ever printing it.
// The database checks the shipping quotes the server signed with this secret (place_order); the server uses the same value from its own
// environment. Usage:
//
//   node scripts/set-quote-secret.mjs --dir ~/Ivan/marketplace-prod --check     # only says whether the Vault has a secret (and how long)
//   node scripts/set-quote-secret.mjs --dir ~/Ivan/marketplace-prod --yes       # writes it (replacing any earlier one)
//
// --dir is required, so the project written to is always chosen on purpose (the repo itself is linked to DEV).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIN_SECRET_LENGTH = 32;

/** The value of NAME in the text of an env file: the last such line, without quotes around it; null when there is none. */
export function readEnvValue(text, name) {
  let found = null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at === -1 || trimmed.slice(0, at).trim() !== name) continue;
    found = trimmed.slice(at + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return found;
}

/** The SQL that replaces the secret in the Vault. Quotes in the value are doubled, so no value can end the string early. */
export function buildVaultSql(secret) {
  const quoted = secret.replaceAll("'", "''");
  return [
    "delete from vault.secrets where name = 'shipping_quote_secret';",
    `select 'stored' as result from (select vault.create_secret('${quoted}', 'shipping_quote_secret', 'HMAC secret for signed shipping quotes (shared with the app)')) s;`,
    "",
  ].join("\n");
}

export const CHECK_SQL = "select count(*) as secrets, coalesce(max(length(decrypted_secret)), 0) as length from vault.decrypted_secrets where name = 'shipping_quote_secret';\n";

function run(dir, sql) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "quote-secret-")), "query.sql");
  fs.writeFileSync(file, sql, { mode: 0o600 });
  try {
    return execFileSync("supabase", ["db", "query", "--linked", "-f", file], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

function main(argv) {
  const dirAt = argv.indexOf("--dir");
  const dir = dirAt === -1 ? null : path.resolve(argv[dirAt + 1] ?? "");
  const check = argv.includes("--check");
  if (!dir || !fs.existsSync(path.join(dir, "supabase", ".temp", "project-ref"))) {
    console.error("Give --dir <a folder where `supabase link` was run> (its supabase/.temp/project-ref must exist).");
    return 2;
  }
  if (!check && !argv.includes("--yes")) {
    console.error("This writes to the linked project. Add --yes to do it, or --check to only look.");
    return 2;
  }
  const ref = fs.readFileSync(path.join(dir, "supabase", ".temp", "project-ref"), "utf8").trim();
  console.log(`Project: ${ref}`);
  if (check) {
    console.log(run(dir, CHECK_SQL).match(/"(secrets|length)": \d+/g)?.join("  ") ?? "no answer");
    return 0;
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const secret = readEnvValue(fs.readFileSync(path.join(repoRoot, ".env.local"), "utf8"), "SHIPPING_QUOTE_SECRET");
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.error(`SHIPPING_QUOTE_SECRET in .env.local is missing or shorter than ${MIN_SECRET_LENGTH} characters.`);
    return 1;
  }
  const answer = run(dir, buildVaultSql(secret));
  console.log(answer.includes("stored") ? "The secret is stored in the Vault." : "Unexpected answer from the database; run with --check.");
  return answer.includes("stored") ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exit(main(process.argv.slice(2)));
