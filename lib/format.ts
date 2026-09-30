export const money = (n: number) => "Rp" + n.toLocaleString("id-ID");

export const formatNumber = (n: number) => n.toLocaleString("id-ID");

const SPRITE_POSITIONS = [
  "0 0",
  "50% 0",
  "100% 0",
  "0 100%",
  "50% 100%",
  "100% 100%",
] as const;

/** Background-position of a product photo inside the demo sprite (3×2 grid). */
export const spritePosition = (pos: number) => SPRITE_POSITIONS[pos] ?? SPRITE_POSITIONS[0];

/** e.g. "30 Sep 2026, 14.05" in Asia/Jakarta, for status history entries created at runtime. */
export const formatDateTime = (date: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}.${get("minute")}`;
};
