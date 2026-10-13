export type AgoUnit = "now" | "minutes" | "hours" | "days" | "weeks" | "months" | "years";
export type Ago = { unit: AgoUnit; n: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago something happened, as a unit and a count ("3 days"), so the wording can come from content/id.json. */
export function timeAgo(iso: string, now: number = Date.now()): Ago {
  const elapsed = Math.max(0, now - new Date(iso).getTime());
  if (!Number.isFinite(elapsed)) return { unit: "now", n: 0 };
  if (elapsed < MINUTE) return { unit: "now", n: 0 };
  if (elapsed < HOUR) return { unit: "minutes", n: Math.floor(elapsed / MINUTE) };
  if (elapsed < DAY) return { unit: "hours", n: Math.floor(elapsed / HOUR) };
  if (elapsed < 7 * DAY) return { unit: "days", n: Math.floor(elapsed / DAY) };
  if (elapsed < 30 * DAY) return { unit: "weeks", n: Math.floor(elapsed / (7 * DAY)) };
  if (elapsed < 365 * DAY) return { unit: "months", n: Math.floor(elapsed / (30 * DAY)) };
  return { unit: "years", n: Math.floor(elapsed / (365 * DAY)) };
}
