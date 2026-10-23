// Run with `npm test`. Reading the env file that holds the server-only secrets for `npm run dev`.
import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error a plain .mjs script with no type declarations
import { parseEnv } from "./env-file.mjs";

test("reads KEY=value lines, skipping comments and blank lines", () => {
  assert.deepEqual(parseEnv("# a comment\n\nA=1\n  B = two  \n"), { A: "1", B: "two" });
});
test("keeps = signs inside a value, and removes matching quotes around it", () => {
  assert.deepEqual(parseEnv("S=a=b==\nQ=\"quoted\"\nR='single'\nM=\"mismatch'"), { S: "a=b==", Q: "quoted", R: "single", M: "\"mismatch'" });
});
test("copes with Windows line endings and a value that is empty", () => {
  assert.deepEqual(parseEnv("A=1\r\nB=\r\n"), { A: "1", B: "" });
});
test("ignores lines that are not assignments, or whose name is not a name", () => {
  assert.deepEqual(parseEnv("just words\n=novalue\n1BAD=x\nBAD NAME=x\nGOOD_1=ok"), { GOOD_1: "ok" });
});
test("the last of a repeated name wins", () => {
  assert.deepEqual(parseEnv("A=1\nA=2"), { A: "2" });
});
test("is empty for empty text", () => {
  assert.deepEqual(parseEnv(""), {});
});
