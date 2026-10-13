"use client";

import { useRef, type ChangeEvent } from "react";
import { t } from "@/lib/i18n";
import { AdminButton } from "@/components/atoms/admin-button";
import { isTooSmallForBestQuality, RECOMMENDED_MIN_WIDTH } from "../../lib/image-variants";
import type { ProductPhoto } from "../../lib/product-repository";
import type { ResizedPhoto } from "../../lib/resize-image";
import styles from "./product-admin.module.css";

/** A photo picked in this form and already resized in the browser, not saved yet. */
export type PendingPhoto = { id: string; resized: ResizedPhoto; previewUrl: string };

type PhotoManagerProps = {
  kept: ProductPhoto[];
  pending: PendingPhoto[];
  max: number;
  busy: boolean;
  processing: boolean;
  error: string | null;
  altText: string;
  urlFor: (photo: ProductPhoto) => string;
  onPick: (files: File[]) => void;
  onMove: (photoId: number, direction: -1 | 1) => void;
  onRemoveKept: (photoId: number) => void;
  onRemovePending: (id: string) => void;
};

/** Photos of one product: the saved ones can be reordered or removed, new ones are added at the end. First is the cover. */
export function PhotoManager({ kept, pending, max, busy, processing, error, altText, urlFor, onPick, onMove, onRemoveKept, onRemovePending }: PhotoManagerProps) {
  const input = useRef<HTMLInputElement>(null);
  const total = kept.length + pending.length;
  const full = total >= max;

  function changed(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) onPick(files);
  }

  return (
    <div className={styles.photos}>
      <label>{t("admin.catalog.form.photos")}</label>
      <p className={styles.hint}>{t("admin.catalog.form.photosHint", { max })}</p>

      {total > 0 && (
        <ul className={styles.photoGrid} aria-label={t("admin.catalog.form.photos")}>
          {kept.map((photo, index) => (
            <li className={styles.photo} key={`k${photo.id}`}>
              <img src={urlFor(photo)} alt={photo.alt || altText} loading="lazy" />
              {index === 0 && <span className={styles.coverTag}>{t("admin.catalog.form.cover")}</span>}
              <div className={styles.photoBar}>
                <button type="button" disabled={busy || index === 0} aria-label={t("admin.catalog.form.moveEarlier")} onClick={() => onMove(photo.id, -1)}>←</button>
                <button type="button" disabled={busy || index === kept.length - 1} aria-label={t("admin.catalog.form.moveLater")} onClick={() => onMove(photo.id, 1)}>→</button>
                <button type="button" data-danger disabled={busy} aria-label={t("admin.catalog.form.removePhoto")} onClick={() => onRemoveKept(photo.id)}>✕</button>
              </div>
            </li>
          ))}
          {pending.map((photo, index) => (
            <li className={styles.photo} key={photo.id}>
              <img src={photo.previewUrl} alt={altText} />
              {kept.length + index === 0 && <span className={styles.coverTag}>{t("admin.catalog.form.cover")}</span>}
              <span className={styles.newTag}>{t("admin.catalog.form.newBadge")}</span>
              {isTooSmallForBestQuality(photo.resized.sourceWidth) && (
                <p className={styles.photoWarn}>{t("admin.catalog.form.smallPhoto", { width: photo.resized.sourceWidth, min: RECOMMENDED_MIN_WIDTH })}</p>
              )}
              <div className={styles.photoBar}>
                <button type="button" data-danger disabled={busy} aria-label={t("admin.catalog.form.removePhoto")} onClick={() => onRemovePending(photo.id)}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className={styles.errorText} role="alert">{error}</p>}
      {processing && <p className={styles.hint} role="status">{t("admin.catalog.form.processing")}</p>}

      <input ref={input} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple tabIndex={-1} aria-label={t("admin.catalog.form.addPhotos")} onChange={changed} />
      <AdminButton small disabled={busy || processing || full} onClick={() => input.current?.click()}>{t("admin.catalog.form.addPhotos")}</AdminButton>
    </div>
  );
}
