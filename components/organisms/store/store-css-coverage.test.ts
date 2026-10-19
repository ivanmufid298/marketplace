// Run with `npm run test:ui`. A class name that no rule styles shows up as a bare browser control (an unstyled button, a bulleted list).
// This looks for them in the storefront components that build their own markup, so one is not found by the shop owner first.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const STORE_CSS = "app/(store)/store.css";
const ADMIN_CSS = "app/admin/admin.css";
const read = (file: string) => fs.readFileSync(file, "utf8");
/** Components that build their own markup, with the stylesheet that must style every class name in them. The picker is in both. */
const FILES: [file: string, stylesheet: string][] = [
  ["features/account/components/account-view.tsx", STORE_CSS],
  ["features/account/components/address-book.tsx", STORE_CSS],
  ["features/account/components/address-form.tsx", STORE_CSS],
  ["features/account/components/change-password-form.tsx", STORE_CSS],
  ["features/shipping/components/destination-picker.tsx", STORE_CSS],
  ["features/shipping/components/destination-picker.tsx", ADMIN_CSS],
  ["components/organisms/store/checkout-flow.tsx", STORE_CSS],
  ["components/organisms/admin/shipping-settings-db.tsx", ADMIN_CSS],
];

/** The class names written out in a file's `className="..."` (and template strings, without their `${}` parts). */
export function classNamesIn(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/className=(?:\{?"([^"]*)"|\{`([^`]*)`)/g)) {
    const text = (m[1] ?? m[2] ?? "").replace(/\$\{[^}]*\}/g, " ");
    for (const c of text.split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(c)) names.add(c);
  }
  return [...names].sort();
}
const styled = (name: string, css = read(STORE_CSS)) => new RegExp(`\\.${name.replace(/[-]/g, "\\-")}(?![\\w-])`).test(css);

describe("classNamesIn", () => {
  it("finds plain and template class names, and skips what is computed", () => {
    expect(classNamesIn('<div className="a b-c" /><p className={`x${open ? " y" : ""} z`} /><i className={cls} />')).toEqual(["a", "b-c", "x", "y", "z"].filter((n) => n !== "y"));
  });
  it("ignores things that are not class names", () => expect(classNamesIn('<div className="Big 9x a_b" />')).toEqual([]));
});

describe("styled", () => {
  it("is true for a class with a rule, also when the rule has a state or is written after another selector, and false for one without", () => {
    expect(styled("label-chip")).toBe(true);
    expect(styled("destination-results")).toBe(true);
    expect(styled("definitely-not-styled")).toBe(false);
  });
  it("does not take a longer class name for a shorter one", () => {
    expect(styled("label")).toBe(false);
    expect(styled("address-card-hea")).toBe(false);
  });
});

describe("the storefront's own components", () => {
  for (const [file, stylesheet] of FILES) {
    it(`${file} uses only class names that ${stylesheet.split("/").pop()} styles`, () => {
      const css = read(stylesheet);
      const missing = classNamesIn(read(file)).filter((c) => !styled(c, css));
      expect(missing).toEqual([]);
    });
  }
});
