import messages from "@/content/id.json";

type Messages = typeof messages;

/** Union of every dot-separated path that ends in a string, e.g. "store.cart.title". */
type Paths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
export type MessageParams = Record<string, string | number>;

function lookup(key: string): string {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : key;
}

/**
 * Returns the UI copy for `key` from content/id.json, replacing `{name}` placeholders with `params`.
 * A missing key is a compile error; if one slips through at runtime the key itself is returned.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const text = lookup(key);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
