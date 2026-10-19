// Run with `npm run test:ui`. A class name that no rule styles shows up as a bare browser control (an unstyled button, a bulleted list).
// This looks for them in the storefront components that build their own markup, so one is not found by the shop owner first.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync("app/(store)/store.css", "utf8");
/** Components of the storefront whose class names must all be styled in store.css. */
const FILES = [
  "features/account/components/account-view.tsx",
  "features/account/components/address-book.tsx",
  "features/account/components/address-form.tsx",
  "features/account/components/change-password-form.tsx",
  "features/shipping/components/destination-picker.tsx",
  "components/organisms/store/checkout-flow.tsx",
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
const styled = (name: string) => new RegExp(`\\.${name.replace(/[-]/g, "\\-")}(?![\\w-])`).test(css);

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
  for (const file of FILES) {
    it(`${file} uses only class names that store.css styles`, () => {
      const missing = classNamesIn(fs.readFileSync(file, "utf8")).filter((c) => !styled(c));
      expect(missing).toEqual([]);
    });
  }
});
