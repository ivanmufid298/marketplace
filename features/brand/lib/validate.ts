import { MAX_NAME_LENGTH } from "./types";

/** The shop name as it would be kept (no spaces around it, 1 to 60 characters, counted as people count them), or null when it is not one. */
export function cleanName(value: string): string | null {
  const trimmed = value.trim();
  const length = [...trimmed].length;
  return length >= 1 && length <= MAX_NAME_LENGTH ? trimmed : null;
}
