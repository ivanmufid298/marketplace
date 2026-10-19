import type { Destination } from "./types";

// How a place from the provider ("KEBAYORAN LAMA SELATAN, JAKARTA SELATAN, DKI JAKARTA") reads to a buyer, and what goes into an
// address from it.

const STAYS_UPPER = new Set(["DKI", "DI", "DIY", "NTB", "NTT", "TNI", "RT", "RW"]);

export const titleCase = (s: string) =>
  s
    .split(/(\s+|,)/)
    .map((w) => (STAYS_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join("");

/** The place as one line: subdistrict, district, city, province, postcode. */
export const placeLine = (d: Pick<Destination, "label">) => titleCase(d.label);

/**
 * A place as two lines for a list: the name it is best known by (the first part of the label), and where it is (the rest, with the
 * postcode set apart): "Sawangan Baru" and "Sawangan, Depok, Jawa Barat · 16511".
 */
export function placeParts(d: Pick<Destination, "label">): { main: string; detail: string } {
  const parts = d.label.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const postcode = parts.length > 1 && /^\d{4,6}$/.test(last) ? last : "";
  const where = titleCase(parts.slice(1, postcode ? -1 : undefined).join(", "));
  return { main: titleCase(parts[0] ?? ""), detail: [where, postcode].filter(Boolean).join(" · ") };
}

/** What goes in an address's "city" line: the district and the city ("Kebayoran Baru, Jakarta Selatan"), within the 100 characters an order allows. */
export function cityLine(d: Pick<Destination, "district" | "city"> & Partial<Pick<Destination, "subdistrict" | "province">>): string {
  const line = [d.district, d.city].filter(Boolean).join(", ") || d.subdistrict || d.province || "";
  return titleCase(line).slice(0, 100);
}
