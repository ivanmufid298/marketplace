import { t } from "@/lib/i18n";
import { AdminButton } from "../atoms/admin-button";

type MediaCardProps = {
  kicker: string;
  headline: string;
  name: string;
  state: string;
  dark?: boolean;
  onEdit: () => void;
};

export function MediaCard({ kicker, headline, name, state, dark = false, onEdit }: MediaCardProps) {
  return (
    <article className="media-card">
      <div className={`media-preview${dark ? " dark" : ""}`}>
        <small>{kicker}</small>
        <strong>{headline}</strong>
      </div>
      <div className="media-body">
        <div>
          <b>{name}</b>
          <span className="sub" style={{ display: "block" }}>{state}</span>
        </div>
        <AdminButton small onClick={onEdit}>{t("admin.content.edit")}</AdminButton>
      </div>
    </article>
  );
}
