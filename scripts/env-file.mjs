// Reads the text of an env file (KEY=value lines) into an object. Comments and blank lines are skipped, a value may be wrapped in
// matching quotes, and the first "=" splits name from value, so "=" inside a value is kept.
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at < 1) continue;
    const name = trimmed.slice(0, at).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    out[name] = trimmed.slice(at + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}
