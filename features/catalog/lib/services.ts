import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createSupabasePhotoStorage, type PhotoStorage } from "./photo-storage";
import { createProductRepository, type ProductRepository } from "./product-repository";
import { resizePhoto, type ResizedPhoto } from "./resize-image";

/** Everything the admin product screens need from the outside world, gathered so tests can swap each piece. */
export type CatalogServices = {
  repo: ProductRepository;
  storage: PhotoStorage;
  resize: (file: File) => Promise<ResizedPhoto>;
  /** A fresh random id per photo. */
  newId: () => string;
};

/** The real thing: Supabase from the browser, with the signed-in admin's session. */
export function createBrowserCatalogServices(): CatalogServices {
  const client = getSupabaseBrowserClient();
  return {
    repo: createProductRepository(client),
    storage: createSupabasePhotoStorage(client, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
    resize: resizePhoto,
    newId: () => crypto.randomUUID(),
  };
}
