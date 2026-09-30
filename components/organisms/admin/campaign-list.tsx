"use client";

import { t } from "@/lib/i18n";
import { CONTENT_CAMPAIGNS } from "@/lib/mock/admin";
import { AdminButton } from "../../atoms/admin-button";
import { MediaCard } from "../../molecules/media-card";
import { SectionTop } from "../../molecules/section-top";
import { useAdmin } from "../../providers/admin-provider";

export function CampaignList() {
  const { openModal } = useAdmin();
  const { banner, popup } = CONTENT_CAMPAIGNS;
  return (
    <section className="view active">
      <SectionTop title={t("admin.content.title")} text={t("admin.content.text")}>
        <div style={{ display: "flex", gap: 8 }}>
          <AdminButton onClick={() => openModal("popup")}>{t("admin.content.addPopup")}</AdminButton>
          <AdminButton variant="primary" onClick={() => openModal("banner")}>{t("admin.content.addBanner")}</AdminButton>
        </div>
      </SectionTop>
      <div className="media-grid">
        <MediaCard kicker={t("admin.content.bannerKicker")} headline={banner.headline} name={banner.name} state={banner.state} onEdit={() => openModal("banner")} />
        <MediaCard dark kicker={t("admin.content.popupKicker")} headline={popup.headline} name={popup.name} state={popup.state} onEdit={() => openModal("popup")} />
      </div>
    </section>
  );
}
