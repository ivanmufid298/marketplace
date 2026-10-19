// Run with `npm test`. Enforces the module boundaries described in ARCHITECTURE.md by reading import statements.
// There is no ESLint in this project, so this test is what keeps features/ from turning back into spaghetti.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/** Which other features each feature may import. Dependencies only point downwards: auth and catalog sit at the bottom. */
export const ALLOWED: Record<string, string[]> = {
  auth: [],
  catalog: [],
  reviews: [],
  orders: ["auth", "catalog"],
  notifications: ["auth"],
  chat: ["auth"],
  cart: ["auth", "catalog"],
  shipping: [],
  account: ["auth", "shipping"],
  checkout: ["auth", "catalog", "cart", "orders", "account"],
};

/** Code every feature may use and that must never import a feature. */
const SHARED_PREFIXES = ["components/atoms/", "components/molecules/", "lib/", "shared/"];
/** The only files other code may import from a feature. */
const ENTRY_POINTS = (feature: string) => [`features/${feature}`, `features/${feature}/server`];
/** Files allowed to read the mock product list directly (test files may use it as fixture data). Everything else goes through useCatalog(), so swapping the mock
 *  for the database later touches one module. The admin order modal is legacy and moves with the admin module. */
const PRODUCT_DATA_READERS = ["features/catalog/", "components/organisms/admin/order-detail-modal.tsx"];
const PRODUCT_DATA_IMPORT = /import\s*\{[^}]*\bproducts\b[^}]*\}\s*from\s*["']@\/lib\/mock\/store["']/;

/** What a server entry point must never reach, because proxy.ts and layouts import it. */
const SERVER_FORBIDDEN_MODULES = ["react", "react-dom", "next/link"];

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

export function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/** Turns an import specifier into a repo-relative path without extension, or null for packages. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  return null;
}

const featureOf = (file: string) => /^features\/([^/]+)\//.exec(file)?.[1] ?? null;
const stripExt = (p: string) => p.replace(/\.(m?[tj]sx?)$/, "");

export function checkBoundaries(files: Record<string, string>): string[] {
  const problems: string[] = [];
  const known = new Set(Object.keys(files).map(stripExt));

  for (const [file, source] of Object.entries(files)) {
    const own = featureOf(file);
    const shared = SHARED_PREFIXES.some((p) => file.startsWith(p));

    for (const spec of importsOf(source)) {
      const resolved = resolveSpecifier(file, spec);
      if (!resolved) continue;
      const target = /^features\/([^/]+)(\/|$)/.exec(stripExt(resolved))?.[1] ?? null;
      if (!target || target === own) continue;
      const clean = stripExt(resolved);

      if (shared) problems.push(`${file}: shared code must not import a feature (${spec})`);
      if (!ENTRY_POINTS(target).includes(clean)) problems.push(`${file}: imports inside ${target} (${spec}); use "@/features/${target}" or "@/features/${target}/server"`);
      if (own && !(ALLOWED[own] ?? []).includes(target)) problems.push(`${file}: feature "${own}" may not depend on "${target}"`);
    }
  }

  for (const [file, source] of Object.entries(files)) {
    if (PRODUCT_DATA_IMPORT.test(source) && !/\.test\.[mt]sx?$/.test(file) && !PRODUCT_DATA_READERS.some((p) => file.startsWith(p))) problems.push(`${file}: reads the mock product list directly; use useCatalog() from "@/features/catalog"`);
  }

  // A server entry point must stay free of React and "use client" files, however deep the chain goes.
  for (const entry of Object.keys(files).filter((f) => /^features\/[^/]+\/server\.ts$/.test(f))) {
    const seen = new Set<string>();
    const walk = (file: string, chain: string[]) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = files[file];
      if (/^\s*["']use client["']/m.test(source)) problems.push(`${entry}: reaches a client component via ${[...chain, file].join(" → ")}`);
      for (const spec of importsOf(source)) {
        if (SERVER_FORBIDDEN_MODULES.includes(spec)) problems.push(`${entry}: reaches "${spec}" via ${[...chain, file].join(" → ")}`);
        const resolved = resolveSpecifier(file, spec);
        if (!resolved || !known.has(resolved)) continue;
        const next = Object.keys(files).find((f) => stripExt(f) === resolved);
        if (next) walk(next, [...chain, file]);
      }
    };
    walk(entry, []);
  }
  return problems;
}

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", ".next", "prototype", "supabase", ".git", "public", "content"]);

function collect(dir: string, out: Record<string, string> = {}) {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    if (SKIP.has(name)) continue;
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(path.join(ROOT, rel)).isDirectory()) collect(rel, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out[rel] = readFileSync(path.join(ROOT, rel), "utf8");
  }
  return out;
}

describe("module boundaries (real repo)", () => {
  const files = collect("");

  it("finds the files it is supposed to check", () => {
    assert.ok(Object.keys(files).length > 50, "scanned suspiciously few files");
    assert.ok(files["features/auth/index.ts"] && files["features/auth/server.ts"], "auth entry points missing");
  });

  it("has no boundary violations", () => assert.deepEqual(checkBoundaries(files), []));
});

describe("checkBoundaries (catches what it should)", () => {
  const base = { "features/auth/index.ts": "export {}", "features/auth/server.ts": "export {}", "features/auth/lib/x.ts": "export {}" };

  it("allows the public entry points", () => {
    const files = { ...base, "app/page.tsx": `import { a } from "@/features/auth";\nimport { b } from "@/features/auth/server";` };
    assert.deepEqual(checkBoundaries(files), []);
  });
  it("rejects a deep import from outside", () => {
    const files = { ...base, "app/page.tsx": `import { x } from "@/features/auth/lib/x";` };
    assert.equal(checkBoundaries(files).length, 1);
  });
  it("rejects a relative deep import from outside", () => {
    const files = { ...base, "components/a.tsx": `import { x } from "../features/auth/lib/x";` };
    assert.equal(checkBoundaries(files).length, 1);
  });
  it("rejects shared code importing a feature", () => {
    const files = { ...base, "components/atoms/b.tsx": `import { a } from "@/features/auth";` };
    assert.ok(checkBoundaries(files).some((p) => p.includes("shared code")));
  });
  it("rejects a dependency the feature is not allowed to have", () => {
    const files = { ...base, "features/cart/index.ts": "export {}", "features/auth/lib/y.ts": `import { c } from "@/features/cart";` };
    assert.ok(checkBoundaries(files).some((p) => p.includes('may not depend on "cart"')));
  });
  it("rejects a server entry that reaches a client component", () => {
    const files = { ...base, "features/auth/server.ts": `export * from "./lib/z";`, "features/auth/lib/z.ts": `import { w } from "../ui";`, "features/auth/ui.tsx": `"use client";\nexport const w = 1;` };
    assert.ok(checkBoundaries(files).some((p) => p.includes("client component")));
  });
  it("rejects a server entry that reaches React", () => {
    const files = { ...base, "features/auth/server.ts": `export * from "./lib/z";`, "features/auth/lib/z.ts": `import { useState } from "react";` };
    assert.ok(checkBoundaries(files).some((p) => p.includes('"react"')));
  });
  it("rejects reading the mock product list outside the catalog module", () => {
    const files = { ...base, "components/a.tsx": `import { products } from "@/lib/mock/store";` };
    assert.ok(checkBoundaries(files).some((p) => p.includes("mock product list")));
  });
  it("allows reading the mock product list inside the catalog module", () => {
    const files = { ...base, "features/catalog/catalog-provider.tsx": `import { products as mock } from "@/lib/mock/store";` };
    assert.deepEqual(checkBoundaries(files), []);
  });
  it("allows importing only types from the mock store elsewhere", () => {
    const files = { ...base, "components/a.tsx": `import { SHIPPING_OPTIONS, type Product } from "@/lib/mock/store";` };
    assert.deepEqual(checkBoundaries(files), []);
  });
  it("reads multi-line imports", () => {
    const files = { ...base, "app/page.tsx": `import {\n  a,\n  b,\n} from "@/features/auth/lib/x";` };
    assert.equal(checkBoundaries(files).length, 1);
  });
});
