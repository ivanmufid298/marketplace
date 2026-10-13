"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { t } from "@/lib/i18n";
import { AdminButton } from "@/components/atoms/admin-button";
import { CloseButton } from "@/components/atoms/close-button";
import { Field } from "@/components/molecules/field";
import { Select } from "@/components/molecules/select";
import type { SaveError } from "../../lib/db-errors";
import { variantKey } from "../../lib/image-variants";
import { EMPTY_PRODUCT_FORM, LIMITS, parseProduct, PRODUCT_STATUSES, toFormValues, type ProductFormErrors, type ProductFormValues } from "../../lib/product-form";
import type { AdminProduct, Category, ProductPhoto } from "../../lib/product-repository";
import { ResizeFailure } from "../../lib/resize-image";
import { saveProduct, type SaveWarning } from "../../lib/save-product";
import type { CatalogServices } from "../../lib/services";
import { PhotoManager, type PendingPhoto } from "./photo-manager";
import styles from "./product-admin.module.css";

type ProductFormDialogProps = {
  services: CatalogServices;
  /** null opens an empty form for a new product. */
  product: AdminProduct | null;
  categories: Category[];
  /** Called as soon as the product itself is saved, even if some photo steps then reported a problem. */
  onSaved: (product: AdminProduct, created: boolean) => void;
  onClose: () => void;
  notify: (message: string) => void;
};

const saveErrorText = (error: SaveError | { kind: "upload" }) => t(`admin.catalog.saveErrors.${error.kind}`);

function warningText(warning: SaveWarning): string {
  switch (warning.step) {
    case "remove": return t("admin.catalog.warnings.remove");
    case "orphans": return t("admin.catalog.warnings.orphans");
    case "order": return t("admin.catalog.warnings.order");
    case "reload": return t("admin.catalog.warnings.reload");
    case "upload": return t("admin.catalog.warnings.upload", { failed: warning.attempted - warning.saved, total: warning.attempted });
  }
}

export function ProductFormDialog({ services, product, categories, onSaved, onClose, notify }: ProductFormDialogProps) {
  // After a save that reported a problem the dialog stays open on the saved product, so a second save updates it.
  const [current, setCurrent] = useState<AdminProduct | null>(product);
  const [values, setValues] = useState<ProductFormValues>(product ? toFormValues(product) : EMPTY_PRODUCT_FORM);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [kept, setKept] = useState<ProductPhoto[]>(product?.photos ?? []);
  const [removed, setRemoved] = useState<ProductPhoto[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Preview URLs are made in this form and must be released when a photo is dropped or the form closes.
  const previews = useRef<Set<string>>(new Set());
  useEffect(() => {
    const live = previews.current;
    return () => live.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const release = (url: string) => {
    URL.revokeObjectURL(url);
    previews.current.delete(url);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };
  const fieldError = (key: keyof ProductFormValues) => (errors[key] ? <p className={styles.errorText} role="alert">{t(`admin.catalog.form.errors.${errors[key]}`)}</p> : null);

  async function pickPhotos(files: File[]) {
    setPhotoError(null);
    const room = Math.max(0, LIMITS.photos - kept.length - pending.length);
    if (files.length > room) setPhotoError(t("admin.catalog.photoErrors.tooMany", { max: LIMITS.photos }));
    setProcessing(true);
    for (const file of files.slice(0, room)) {
      try {
        const resized = await services.resize(file);
        const previewUrl = URL.createObjectURL(resized.variants[0].blob);
        previews.current.add(previewUrl);
        setPending((list) => [...list, { id: services.newId(), resized, previewUrl }]);
      } catch (error) {
        setPhotoError(error instanceof ResizeFailure ? t(`admin.catalog.photoErrors.${error.reason}`) : t("admin.catalog.photoErrors.unreadable"));
      }
    }
    setProcessing(false);
  }

  function move(photoId: number, direction: -1 | 1) {
    setKept((list) => {
      const from = list.findIndex((p) => p.id === photoId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  function removeKept(photoId: number) {
    const photo = kept.find((p) => p.id === photoId);
    if (!photo) return;
    setKept((list) => list.filter((p) => p.id !== photoId));
    setRemoved((list) => [...list, photo]);
  }

  function removePending(id: string) {
    const photo = pending.find((p) => p.id === id);
    if (photo) release(photo.previewUrl);
    setPending((list) => list.filter((p) => p.id !== id));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = parseProduct(values);
    if (!parsed.ok) return setErrors(parsed.errors);

    setErrors({});
    setFormError(null);
    setWarnings([]);
    setSaving(true);
    const outcome = await saveProduct(services, {
      productId: current?.id ?? null,
      input: parsed.value,
      removed,
      keptInOrder: kept,
      added: pending.map((p) => ({ resized: p.resized, alt: parsed.value.name })),
    });
    setSaving(false);

    if (!outcome.ok) return setFormError(saveErrorText(outcome.error));

    onSaved(outcome.product, outcome.created);
    notify(t(outcome.created ? "admin.catalog.toast.created" : "admin.catalog.toast.updated"));
    if (outcome.warnings.length === 0) return onClose();

    // The product is saved but a photo step needs attention: stay open, on the saved product.
    const upload = outcome.warnings.find((w): w is Extract<SaveWarning, { step: "upload" }> => w.step === "upload");
    const done = upload ? upload.saved : pending.length;
    pending.slice(0, done).forEach((p) => release(p.previewUrl));
    setCurrent(outcome.product);
    setKept(outcome.product.photos);
    setRemoved([]);
    setPending(pending.slice(done));
    setWarnings(outcome.warnings.map(warningText));
  }

  const title = t(current ? "admin.catalog.form.titleEdit" : "admin.catalog.form.titleNew");
  const categoryOptions = [{ value: "", label: t("admin.catalog.form.categoryPlaceholder") }, ...categories.filter((c) => c.isActive || String(c.id) === values.categoryId).map((c) => ({ value: String(c.id), label: c.name }))];
  const statusOptions = PRODUCT_STATUSES.map((s) => ({ value: s, label: t(`admin.catalog.status.${s}`) }));

  return (
    <div className="modal-backdrop open" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <CloseButton label={t("common.close")} onClick={() => !saving && onClose()} />
        </div>
        <form onSubmit={submit} noValidate>
          <div className="modal-body">
            <div className="fields">
              {formError && <p className={styles.formError} role="alert">{formError}</p>}
              {warnings.map((text) => <p className={styles.formWarning} role="status" key={text}>{text}</p>)}

              <Field full label={t("admin.catalog.form.name")} htmlFor="productName">
                <input id="productName" value={values.name} placeholder={t("admin.catalog.form.namePlaceholder")} onChange={(e) => set("name", e.target.value)} />
                {fieldError("name")}
              </Field>

              <Field label={t("admin.catalog.form.category")}>
                <Select options={categoryOptions} value={values.categoryId} onChange={(v) => set("categoryId", v)} />
                {categories.length === 0 && <p className={styles.hint}>{t("admin.catalog.form.noCategories")}</p>}
                {fieldError("categoryId")}
              </Field>

              <Field label={t("admin.catalog.form.status")}>
                <Select options={statusOptions} value={values.status} onChange={(v) => set("status", v as ProductFormValues["status"])} />
                {fieldError("status")}
              </Field>

              <Field label={t("admin.catalog.form.price")} htmlFor="productPrice">
                <input id="productPrice" inputMode="numeric" value={values.price} placeholder={t("admin.catalog.form.pricePlaceholder")} onChange={(e) => set("price", e.target.value)} />
                {fieldError("price")}
              </Field>

              <Field label={t("admin.catalog.form.comparePrice")} htmlFor="productCompare">
                <input id="productCompare" inputMode="numeric" value={values.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} />
                <p className={styles.hint}>{t("admin.catalog.form.compareHint")}</p>
                {fieldError("compareAtPrice")}
              </Field>

              <Field label={t("admin.catalog.form.stock")} htmlFor="productStock">
                <input id="productStock" inputMode="numeric" value={values.stock} onChange={(e) => set("stock", e.target.value)} />
                {fieldError("stock")}
              </Field>

              <Field label={t("admin.catalog.form.weight")} htmlFor="productWeight">
                <input id="productWeight" inputMode="numeric" value={values.weightGram} onChange={(e) => set("weightGram", e.target.value)} />
                <p className={styles.hint}>{t("admin.catalog.form.weightHint")}</p>
                {fieldError("weightGram")}
              </Field>

              <Field full label={t("admin.catalog.form.badge")} htmlFor="productBadge">
                <input id="productBadge" value={values.badge} placeholder={t("admin.catalog.form.badgePlaceholder")} onChange={(e) => set("badge", e.target.value)} />
                {fieldError("badge")}
              </Field>

              <Field full label={t("admin.catalog.form.description")} htmlFor="productDescription">
                <textarea id="productDescription" value={values.description} placeholder={t("admin.catalog.form.descriptionPlaceholder")} onChange={(e) => set("description", e.target.value)} />
                {fieldError("description")}
              </Field>

              <PhotoManager
                kept={kept}
                pending={pending}
                max={LIMITS.photos}
                busy={saving}
                processing={processing}
                error={photoError}
                altText={values.name.trim()}
                urlFor={(photo) => services.storage.publicUrl(variantKey(photo.objectKey, 400))}
                onPick={pickPhotos}
                onMove={move}
                onRemoveKept={removeKept}
                onRemovePending={removePending}
              />
            </div>
          </div>
          <div className="modal-foot">
            <AdminButton disabled={saving} onClick={onClose}>{t("common.cancel")}</AdminButton>
            <AdminButton variant="primary" type="submit" disabled={saving || processing}>{saving ? t("admin.catalog.form.saving") : t("admin.catalog.form.save")}</AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
