import { COURIER_CODES, MAX_FEE, MAX_MARKUP, type ManualMethod, type ShippingSettings } from "./settings-types";

export type SettingsProblem = "couriers" | "freeShippingMin" | "markup" | "origin";
export type MethodProblem = "label" | "note" | "fee";

const isWhole = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

/** What is wrong with the shop's settings, by field. Empty when they can be saved. The same limits the database holds. */
export function validateSettings(s: ShippingSettings): Partial<Record<SettingsProblem, true>> {
  const problems: Partial<Record<SettingsProblem, true>> = {};
  if (s.couriers.length < 1 || s.couriers.length > 20 || s.couriers.some((c) => !COURIER_CODES.includes(c)) || new Set(s.couriers).size !== s.couriers.length) problems.couriers = true;
  if (s.freeShippingMin !== null && (!isWhole(s.freeShippingMin) || s.freeShippingMin < 0)) problems.freeShippingMin = true;
  if (!isWhole(s.markup) || Math.abs(s.markup) > MAX_MARKUP) problems.markup = true;
  const hasId = s.originId !== null;
  const hasLabel = s.originLabel !== null && s.originLabel.trim().length > 0;
  if (hasId !== hasLabel || (hasId && (!isWhole(s.originId) || s.originId <= 0)) || (hasLabel && (s.originLabel ?? "").length > 200)) problems.origin = true;
  return problems;
}

/** What is wrong with one manual rate. */
export function validateMethod(m: Omit<ManualMethod, "code">): Partial<Record<MethodProblem, true>> {
  const problems: Partial<Record<MethodProblem, true>> = {};
  const label = m.label.trim();
  if (label.length < 1 || label.length > 60) problems.label = true;
  if (m.note.trim().length > 120) problems.note = true;
  if (!isWhole(m.fee) || m.fee < 0 || m.fee > MAX_FEE) problems.fee = true;
  return problems;
}
