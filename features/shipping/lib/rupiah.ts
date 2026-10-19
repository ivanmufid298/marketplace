/**
 * A rupiah amount as typed: "18.000", "Rp 18000", " 2 000 ". Dots, spaces, and "Rp" are only for reading and are dropped; a minus is
 * kept when negative amounts are allowed. Null when it is not a whole number (a comma or a letter is not).
 */
export function parseRupiah(text: string, { allowNegative = false }: { allowNegative?: boolean } = {}): number | null {
  const cleaned = text.replace(/rp/gi, "").replace(/[.\s]/g, "");
  const match = allowNegative ? /^-?\d+$/.exec(cleaned) : /^\d+$/.exec(cleaned);
  if (!match) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

/** An amount for an input box: digits grouped with dots, no "Rp". */
export const groupRupiah = (n: number) => n.toLocaleString("id-ID");
