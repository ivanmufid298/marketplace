import type { Interaction } from "@/lib/mock/admin";

type InteractionItemProps = {
  interaction: Interaction;
  active: boolean;
  onSelect: () => void;
};

export function InteractionItem({ interaction: i, active, onSelect }: InteractionItemProps) {
  return (
    <button type="button" className={`interaction-item${active ? " active" : ""}`} onClick={onSelect}>
      <span className="interaction-avatar">{i.name[0]}</span>
      <span>
        <b>{i.name}</b>
        <span className="sub">{i.id}</span>
        <span className="interaction-preview">{i.preview}</span>
      </span>
      <span>
        <span className="interaction-time">{i.time}</span>
        {i.unread > 0 && <span className="unread">{i.unread}</span>}
      </span>
    </button>
  );
}
