import type { ReactNode } from "react";

export type TimelineItem = { key: string; at: string; title: ReactNode; meta?: string; note?: string };

/** Newest-first list of status changes. */
export function HistoryTimeline({ items, empty }: { items: TimelineItem[]; empty: string }) {
  if (!items.length) return <p className="sub">{empty}</p>;
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.key}>
          <div className="timeline-title">{item.title}</div>
          <div className="sub">{item.at}{item.meta ? ` · ${item.meta}` : ""}</div>
          {item.note && <div className="timeline-note">“{item.note}”</div>}
        </li>
      ))}
    </ol>
  );
}
