export const money = (n: number) => "Rp" + n.toLocaleString("id-ID");

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
