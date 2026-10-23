// The shop's public profile: its name and its logo. Everyone reads it (the header, later the emails); only admins change it.

export const DEFAULT_SHOP_NAME = "Market by Kith";
export const MAX_NAME_LENGTH = 60;

export type ShopProfile = {
  name: string;
  /** Where the logo file is in the logo bucket (`logo/<id>.png`), or null when the shop has none yet. */
  logoKey: string | null;
};

export const DEFAULT_PROFILE: ShopProfile = { name: DEFAULT_SHOP_NAME, logoKey: null };

/** Why something failed. `logo*` come from preparing a picked picture, the rest from the database. */
export type BrandError = "invalidName" | "logoType" | "logoSize" | "logoUnreadable" | "logoEncode" | "forbidden" | "network" | "unknown";
export type BrandResult<T> = { ok: true; value: T } | { ok: false; error: BrandError };

export type BrandRepository = {
  get(): Promise<BrandResult<ShopProfile>>;
  saveName(name: string): Promise<BrandResult<null>>;
  /** Points the profile at a logo file already uploaded, or at none. */
  saveLogoKey(key: string | null): Promise<BrandResult<null>>;
};

/** Where logo files live. Like the product photos' storage, a small interface so the files can move host later. */
export type LogoStorage = {
  upload(key: string, blob: Blob): Promise<void>;
  /** Removes a file. A file that is not there is not an error. */
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
};

export type BrandServices = { repo: BrandRepository; storage: LogoStorage; newId: () => string };

/** The bucket and the shape of a logo's key, as the database enforces them. */
export const LOGO_BUCKET = "shop-brand";
export const LOGO_KEY_PATTERN = /^logo\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/;
export const logoKeyFor = (id: string) => `logo/${id}.png`;

/** The address of a file in the public logo bucket. */
export function publicLogoUrl(supabaseUrl: string, key: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
