"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import type { OrderError, Outcome } from "@/features/orders";
import type { Order } from "@/lib/mock/orders";
import { AdminButton } from "../../atoms/admin-button";
import { CloseButton } from "../../atoms/close-button";

type ProofViewerDialogProps = {
  order: Order;
  /** A short-lived link to one proof of the order, by its position. */
  load: (order: Order, index: number) => Promise<Outcome<string | null>>;
  onClose: () => void;
};

type Link = { status: "loading" } | { status: "error"; error: OrderError } | { status: "ready"; url: string };

/** The file itself could not be drawn (the link works, but what it points to is not a picture the browser can show). */
const DISPLAY_FAILED: OrderError = { kind: "proofUnreadable" };

/** Shows a transfer proof right in the admin, so checking it does not mean leaving the screen. */
export function ProofViewerDialog({ order, load, onClose }: ProofViewerDialogProps) {
  const proofs = order.proofs ?? [];
  const [index, setIndex] = useState(Math.max(0, proofs.length - 1));
  const [link, setLink] = useState<Link>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // The frame keeps one size the whole time; this says whether the picture has been drawn yet, so a skeleton fills it until then.
  const [drawn, setDrawn] = useState(false);
  const proof = proofs[index];

  useEffect(() => {
    let current = true;
    setLink({ status: "loading" });
    setDrawn(false);
    void load(order, index).then((result) => {
      // A slower answer for a proof the admin has already moved away from must not replace the newer one.
      if (!current) return;
      if (!result.ok) setLink({ status: "error", error: result.error });
      else setLink(result.value ? { status: "ready", url: result.value } : { status: "error", error: { kind: "orderNotFound" } });
    });
    return () => {
      current = false;
    };
  }, [load, order, index, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = t("admin.orders.proofViewer.title", { number: order.number });
  return (
    <div className="modal-backdrop open" style={{ zIndex: 140 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal proof-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {proof && <span className="sub">{t("admin.orders.proofViewer.subtitle", { buyer: order.buyer, time: proof.at })}</span>}
          </div>
          <CloseButton label={t("common.close")} onClick={onClose} />
        </div>
        <div className="modal-body">
          {proofs.length > 1 && (
            <div className="proof-tabs" role="group" aria-label={t("admin.orders.modal.proofs")}>
              {proofs.map((p, i) => (
                <AdminButton key={p.objectKey} small variant={i === index ? "primary" : "line"} aria-pressed={i === index} onClick={() => setIndex(i)}>
                  {t("admin.orders.proofViewer.tab", { number: i + 1 })}
                </AdminButton>
              ))}
            </div>
          )}
          <div className="proof-frame" data-drawn={drawn}>
            {(link.status === "loading" || (link.status === "ready" && !drawn)) && (
              <div className="proof-skeleton" role="status">
                <span className="sr-only">{t("admin.orders.proofViewer.loading")}</span>
              </div>
            )}
            {link.status === "error" && (
              <div className="proof-message" role="alert">
                <p>{t(`admin.orders.errors.${link.error.kind}`)}</p>
                <AdminButton small onClick={() => setAttempt((n) => n + 1)}>{t("admin.orders.retry")}</AdminButton>
              </div>
            )}
            {link.status === "ready" && proof?.mime === "application/pdf" && <iframe src={link.url} title={title} onLoad={() => setDrawn(true)} />}
            {link.status === "ready" && proof?.mime !== "application/pdf" && (
              // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link: next/image cannot cache or optimize it
              <img src={link.url} alt={title} onLoad={() => setDrawn(true)} onError={() => setLink({ status: "error", error: DISPLAY_FAILED })} />
            )}
          </div>
          {link.status === "ready" && (
            <p className="sub" style={{ margin: "12px 0 0" }}>
              <a href={link.url} target="_blank" rel="noopener noreferrer">{t("admin.orders.proofViewer.openTab")}</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
