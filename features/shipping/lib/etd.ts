/**
 * How long a courier says a parcel takes, as the shop words it: "1-2 hari". The provider writes "1-2 day", "3 days", or leaves it
 * empty; anything without a number is not shown, rather than guessed at.
 */
export function etdText(etd: string): string {
  const match = /(\d+)(?:\s*-\s*(\d+))?/.exec(etd);
  if (!match) return "";
  return `${match[2] ? `${match[1]}-${match[2]}` : match[1]} hari`;
}
