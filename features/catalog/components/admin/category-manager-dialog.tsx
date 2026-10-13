"use client";

import { useEffect, useState, type FormEvent } from "react";
import { t } from "@/lib/i18n";
import { AdminButton } from "@/components/atoms/admin-button";
import { CloseButton } from "@/components/atoms/close-button";
import type { SaveError } from "../../lib/db-errors";
import { LIMITS } from "../../lib/product-form";
import type { Category } from "../../lib/product-repository";
import type { CatalogServices } from "../../lib/services";
import styles from "./product-admin.module.css";

type CategoryManagerDialogProps = {
  services: CatalogServices;
  categories: Category[];
  /** How many products use each category, by category id. Only unused categories can be deleted. */
  productCounts: Record<number, number>;
  onAdded: (category: Category) => void;
  onChanged: (category: Category) => void;
  onRemoved: (id: number) => void;
  onClose: () => void;
  notify: (message: string) => void;
};

const errorText = (error: SaveError) => t(`admin.catalog.saveErrors.${error.kind}`);

/** Create, rename, switch on or off, and delete categories. Opened from the product screen. */
export function CategoryManagerDialog({ services, categories, productCounts, onAdded, onChanged, onRemoved, onClose, notify }: CategoryManagerDialogProps) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  /** Runs one request, keeping the dialog from taking a second action meanwhile. */
  async function run<T>(request: () => Promise<{ ok: true; value: T } | { ok: false; error: SaveError }>): Promise<{ value: T } | null> {
    setBusy(true);
    setError(null);
    const result = await request();
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return null;
    }
    return { value: result.value };
  }

  const tooLong = (name: string) => name.length > LIMITS.categoryName;

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    if (tooLong(name)) return setError(t("admin.catalog.categories.tooLong", { max: LIMITS.categoryName }));
    const done = await run(() => services.repo.createCategory(name));
    if (!done) return;
    onAdded(done.value);
    setNewName("");
    notify(t("admin.catalog.toast.categoryCreated"));
  }

  function startEdit(category: Category) {
    setConfirmingId(null);
    setError(null);
    setEditingId(category.id);
    setEditName(category.name);
  }

  async function saveName(category: Category, e: FormEvent) {
    e.preventDefault();
    const name = editName.trim();
    if (busy) return;
    if (!name) return setError(t("admin.catalog.categories.nameRequired"));
    if (tooLong(name)) return setError(t("admin.catalog.categories.tooLong", { max: LIMITS.categoryName }));
    if (name === category.name) return setEditingId(null);
    const done = await run(() => services.repo.updateCategory(category.id, { name }));
    if (!done) return;
    onChanged(done.value);
    setEditingId(null);
    notify(t("admin.catalog.toast.categoryRenamed"));
  }

  async function toggle(category: Category) {
    if (busy) return;
    const done = await run(() => services.repo.updateCategory(category.id, { isActive: !category.isActive }));
    if (!done) return;
    onChanged(done.value);
    notify(t(done.value.isActive ? "admin.catalog.toast.categoryActivated" : "admin.catalog.toast.categoryDeactivated"));
  }

  async function remove(category: Category) {
    if (busy) return;
    const done = await run(() => services.repo.deleteCategory(category.id));
    setConfirmingId(null);
    if (!done) return;
    onRemoved(category.id);
    notify(t("admin.catalog.toast.categoryDeleted"));
  }

  const title = t("admin.catalog.categories.title");

  return (
    <div className="modal-backdrop open" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <CloseButton label={t("common.close")} onClick={() => !busy && onClose()} />
        </div>
        <div className="modal-body">
          <p className={styles.hint}>{t("admin.catalog.categories.text")}</p>

          <form className={styles.inlineCreate} onSubmit={add}>
            <input value={newName} aria-label={t("admin.catalog.categories.newName")} placeholder={t("admin.catalog.categories.newPlaceholder")} onChange={(e) => setNewName(e.target.value)} />
            <AdminButton type="submit" variant="primary" disabled={busy || !newName.trim()}>{t("admin.catalog.categories.add")}</AdminButton>
          </form>

          {error && <p className={styles.errorText} role="alert">{error}</p>}

          {categories.length === 0 ? (
            <p className={styles.notice}>{t("admin.catalog.categories.empty")}</p>
          ) : (
            <ul className={styles.categoryList}>
              {categories.map((c) => {
                const count = productCounts[c.id] ?? 0;
                return (
                  <li key={c.id} className={styles.categoryRow} data-active={c.isActive}>
                    {editingId === c.id ? (
                      <form className={styles.categoryEdit} onSubmit={(e) => void saveName(c, e)}>
                        <input value={editName} autoFocus aria-label={t("admin.catalog.categories.renameLabel", { name: c.name })} onChange={(e) => setEditName(e.target.value)} />
                        <AdminButton type="submit" variant="primary" small disabled={busy}>{t("admin.catalog.categories.save")}</AdminButton>
                        <AdminButton small disabled={busy} onClick={() => setEditingId(null)}>{t("admin.catalog.categories.cancel")}</AdminButton>
                      </form>
                    ) : (
                      <>
                        <div className={styles.categoryName}>
                          <strong>{c.name}</strong>
                          <span className={styles.statusPill} data-status={c.isActive ? "active" : "draft"}>{t(c.isActive ? "admin.catalog.categories.active" : "admin.catalog.categories.inactive")}</span>
                          <span className={styles.hint}>{t("admin.catalog.categories.productCount", { count })}</span>
                        </div>
                        <div className={styles.categoryActions}>
                          {confirmingId === c.id ? (
                            <>
                              <span className={styles.hint}>{t("admin.catalog.categories.confirmDelete", { name: c.name })}</span>
                              <AdminButton small disabled={busy} onClick={() => void remove(c)}>{t("admin.catalog.categories.confirmYes")}</AdminButton>
                              <AdminButton small disabled={busy} onClick={() => setConfirmingId(null)}>{t("admin.catalog.categories.cancel")}</AdminButton>
                            </>
                          ) : (
                            <>
                              <AdminButton small disabled={busy} aria-label={t("admin.catalog.categories.renameLabel", { name: c.name })} onClick={() => startEdit(c)}>{t("admin.catalog.categories.rename")}</AdminButton>
                              <AdminButton small disabled={busy} onClick={() => void toggle(c)}>{t(c.isActive ? "admin.catalog.categories.deactivate" : "admin.catalog.categories.activate")}</AdminButton>
                              <AdminButton
                                small
                                disabled={busy || count > 0}
                                title={count > 0 ? t("admin.catalog.categories.inUse") : undefined}
                                aria-label={t("admin.catalog.categories.deleteLabel", { name: c.name })}
                                onClick={() => { setError(null); setEditingId(null); setConfirmingId(c.id); }}
                              >
                                {t("admin.catalog.categories.delete")}
                              </AdminButton>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className={styles.hint}>{t("admin.catalog.categories.deleteHint")}</p>
        </div>
      </div>
    </div>
  );
}
