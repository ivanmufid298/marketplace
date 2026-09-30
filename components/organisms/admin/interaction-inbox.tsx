"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { AdminButton } from "../../atoms/admin-button";
import { Icon } from "../../atoms/icon";
import { ConversationMessage } from "../../molecules/conversation-message";
import { InteractionItem } from "../../molecules/interaction-item";
import { SearchField } from "../../molecules/search-field";
import { Select } from "../../molecules/select";
import { SectionTop } from "../../molecules/section-top";
import { useAdmin } from "../../providers/admin-provider";

export function InteractionInbox() {
  const { interactions, activeInteractionId, selectInteraction, toggleInteractionStatus, replyInteraction } = useAdmin();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  // Mobile shows either the list or the thread; desktop always shows both.
  const [chatOpen, setChatOpen] = useState(false);
  const active = interactions.find((i) => i.id === activeInteractionId) ?? null;
  const box = useRef<HTMLDivElement>(null);

  const filters = [
    { value: "all", label: t("admin.interactions.filterAll") },
    { value: "open", label: t("admin.interactions.filterOpen") },
    { value: "handled", label: t("admin.interactions.filterHandled") },
  ];

  // The thread shown on open counts as read.
  useEffect(() => {
    if (activeInteractionId) selectInteraction(activeInteractionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [active?.messages.length, activeInteractionId]);

  const list = interactions.filter(
    (i) => (filter === "all" || i.status === filter) && (i.name + " " + i.id + " " + i.preview).toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="view active" id="view-interactions">
      <SectionTop title={t("admin.interactions.title")} text={t("admin.interactions.text")}>
        <div className="filters"><Select options={filters} value={filter} onChange={setFilter} /></div>
      </SectionTop>
      <div className={`interaction-layout${chatOpen ? " chat-open" : ""}`}>
        <div className="interaction-list">
          <div className="interaction-search">
            <SearchField variant="admin" value={query} onChange={setQuery} placeholder={t("admin.interactions.search")} />
          </div>
          <div>
            {list.map((i) => (
              <InteractionItem
                key={i.id}
                interaction={i}
                active={i.id === activeInteractionId}
                onSelect={() => {
                  selectInteraction(i.id);
                  setChatOpen(true);
                }}
              />
            ))}
          </div>
        </div>
        <div className="conversation">
          <div className="conversation-head">
            <button type="button" className="chat-back" aria-label={t("admin.interactions.backToList")} onClick={() => setChatOpen(false)}>
              <Icon name="back" />
            </button>
            <div className="conversation-meta">
              <span className="interaction-avatar">{active?.name[0]}</span>
              <div>
                <b>{active?.name}</b>
                <span className="sub" style={{ display: "block" }}>
                  {active && `${active.id} · ${active.status === "open" ? t("admin.interactions.statusOpen") : t("admin.interactions.statusHandled")}`}
                </span>
              </div>
            </div>
            {active && (
              <AdminButton
                variant="soft"
                small
                aria-label={active.status === "open" ? t("admin.interactions.markHandled") : t("admin.interactions.reopen")}
                title={active.status === "open" ? t("admin.interactions.markHandled") : t("admin.interactions.reopen")}
                onClick={() => toggleInteractionStatus(active.id)}
              >
                {/* On mobile only the icon shows: a check to finish, an undo arrow to reopen. */}
                <Icon name={active.status === "open" ? "check" : "undo"} />
                <span className="btn-label">{active.status === "open" ? t("admin.interactions.markHandled") : t("admin.interactions.reopen")}</span>
              </AdminButton>
            )}
          </div>
          <div className="conversation-messages" ref={box}>
            {active?.messages.map((m, idx) => (
              <ConversationMessage
                key={idx}
                from={m.from}
                text={m.text}
                meta={`${m.from === "admin" ? t("admin.interactions.senderAdmin") : t("admin.interactions.senderCustomer")} · ${m.time}`}
              />
            ))}
          </div>
          <form
            className="reply-form"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem("reply") as HTMLInputElement;
              if (active) replyInteraction(active.id, input.value);
              input.value = "";
            }}
          >
            <input name="reply" placeholder={t("admin.interactions.replyPlaceholder")} autoComplete="off" />
            <AdminButton variant="primary" type="submit">{t("common.send")}</AdminButton>
          </form>
        </div>
      </div>
    </section>
  );
}
