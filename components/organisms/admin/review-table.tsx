"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { REVIEW_STATS } from "@/lib/mock/admin";
import { AdminButton } from "../../atoms/admin-button";
import { StatusBadge } from "../../atoms/badges";
import { MetricCard } from "../../molecules/metric-card";
import { SectionTop } from "../../molecules/section-top";
import { stars } from "../../molecules/review-summary";
import { Select } from "../../molecules/select";
import { useAdmin } from "../../providers/admin-provider";

export function ReviewTable() {
  const { reviews, toggleReview } = useAdmin();
  const [rating, setRating] = useState("all");
  const [status, setStatus] = useState("all");

  const ratingOptions = [{ value: "all", label: t("admin.reviews.ratingAll") }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: t("admin.reviews.ratingOption", { n }) }))];
  const statusOptions = [
    { value: "all", label: t("admin.reviews.statusAll") },
    { value: "visible", label: t("admin.reviews.visible") },
    { value: "hidden", label: t("admin.reviews.hidden") },
  ];
  const list = reviews.filter((r) => (rating === "all" || r.rating === Number(rating)) && (status === "all" || r.status === status));

  return (
    <section className="view active">
      <SectionTop title={t("admin.reviews.title")} text={t("admin.reviews.text")}>
        <div className="filters">
          <Select options={ratingOptions} value={rating} onChange={setRating} />
          <Select options={statusOptions} value={status} onChange={setStatus} />
        </div>
      </SectionTop>
      <div className="cards" style={{ marginBottom: 18 }}>
        <MetricCard label={t("admin.reviews.averageRating")} value={REVIEW_STATS.average} note={t("admin.reviews.averageNote", { count: REVIEW_STATS.count })} />
        <MetricCard label={t("admin.reviews.pendingModeration")} value={String(REVIEW_STATS.pending)} note={t("admin.reviews.pendingNote")} warn />
      </div>
      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("admin.reviews.buyer")}</th>
                <th>{t("admin.reviews.product")}</th>
                <th>{t("admin.reviews.rating")}</th>
                <th>{t("admin.reviews.review")}</th>
                <th>{t("admin.table.status")}</th>
                <th>{t("admin.table.action")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.buyer}</strong><span className="sub">{t("admin.reviews.verifiedBuyer")}</span></td>
                  <td>{r.product}</td>
                  <td><span style={{ color: "#d66a87", whiteSpace: "nowrap" }}>{stars(r.rating)}</span></td>
                  <td style={{ maxWidth: 330 }}>{r.text}</td>
                  <td>
                    <StatusBadge tone={r.status === "visible" ? "success" : "failed"}>
                      {r.status === "visible" ? t("admin.reviews.visible") : t("admin.reviews.hidden")}
                    </StatusBadge>
                  </td>
                  <td>
                    <AdminButton small onClick={() => toggleReview(r.id)}>
                      {r.status === "visible" ? t("admin.reviews.hide") : t("admin.reviews.show")}
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
