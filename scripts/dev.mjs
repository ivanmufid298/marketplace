#!/usr/bin/env node
// `npm run dev`: starts Next.js with the server-only secrets from .env.secrets.local in its environment.
//
// The secrets live in a file Next.js does not know, because Next.js and OpenNext bake every .env* file they know into the Cloudflare
// Worker bundle. (Node's own --env-file flag cannot be used instead: Next.js passes it on to its child processes through NODE_OPTIONS,
// where Node refuses it.) Values already set in the shell win over the file.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "./env-file.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, ".env.secrets.local");
const fromFile = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: { ...fromFile, ...process.env },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
