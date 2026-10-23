/** What a courier's tracking number (nomor resi) may look like: letters, digits and dashes, 5 to 40 characters. The database enforces the same. */
export const TRACKING_PATTERN = /^[A-Za-z0-9-]{5,40}$/;

/** The tracking number as it would be kept (without the spaces around it), or null when it is not one. */
export function cleanTracking(value: string): string | null {
  const trimmed = value.trim();
  return TRACKING_PATTERN.test(trimmed) ? trimmed : null;
}
