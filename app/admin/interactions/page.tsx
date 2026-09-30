"use client";

import { useEffect, useRef, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { Icon, SearchBar, SectionTop, Select } from "@/components/admin/ui";

const FILTERS = [
  { value: "all", label: "Semua interaction" },
  { value: "open", label: "Belum ditangani" },
  { value: "handled", label: "Selesai" },
];

export default function InteractionsPage() {
  const { interactions, activeInteractionId, selectInteraction, toggleInteractionStatus, replyInteraction } = useAdmin();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  // Mobile shows either the list or the thread; desktop always shows both.
  const [chatOpen, setChatOpen] = useState(false);
  const active = interactions.find((i) => i.id === activeInteractionId) ?? null;
  const box = useRef<HTMLDivElement>(null);

  // The thread shown on open counts as read.
  useEffect(() => {
    if (activeInteractionId) selectInteraction(activeInteractionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [active?.messages.length, activeInteractionId]);

  const list = interactions.filter((i) => (filter === "all" || i.status === filter) && (i.name + " " + i.id + " " + i.preview).toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="view active" id="view-interactions">
      <SectionTop title="Customer interactions" text="Setiap percakapan masuk dicatat sebagai interaction terpisah.">
        <div className="filters"><Select options={FILTERS} value={filter} onChange={setFilter} /></div>
      </SectionTop>
      <div className={`interaction-layout${chatOpen ? " chat-open" : ""}`}>
        <div className="interaction-list">
          <div className="interaction-search"><SearchBar value={query} onChange={setQuery} placeholder="Cari interaction…" /></div>
          <div>
            {list.map((i) => (
              <button key={i.id} className={`interaction-item${i.id === activeInteractionId ? " active" : ""}`} onClick={() => { selectInteraction(i.id); setChatOpen(true); }}>
                <span className="interaction-avatar">{i.name[0]}</span>
                <span><b>{i.name}</b><span className="sub">{i.id}</span><span className="interaction-preview">{i.preview}</span></span>
                <span>
                  <span className="interaction-time">{i.time}</span>
                  {i.unread > 0 && <span className="unread">{i.unread}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="conversation">
          <div className="conversation-head">
            <button className="chat-back" aria-label="Kembali ke daftar chat" onClick={() => setChatOpen(false)}><Icon name="back" /></button>
            <div className="conversation-meta">
              <span className="interaction-avatar">{active?.name[0]}</span>
              <div>
                <b>{active?.name}</b>
                <span className="sub" style={{ display: "block" }}>{active && `${active.id} · ${active.status === "open" ? "Belum ditangani" : "Selesai"}`}</span>
              </div>
            </div>
            {active && <button className="btn btn-soft btn-sm" onClick={() => toggleInteractionStatus(active.id)}>{active.status === "open" ? "Tandai selesai" : "Buka kembali"}</button>}
          </div>
          <div className="conversation-messages" ref={box}>
            {active?.messages.map((m, idx) => (
              <div className={`msg ${m.from}`} key={idx}>
                {m.text}
                <div className="msg-time">{m.from === "admin" ? "Admin" : "Customer"} · {m.time}</div>
              </div>
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
            <input name="reply" placeholder="Balas pesan customer…" autoComplete="off" />
            <button className="btn btn-primary">Kirim</button>
          </form>
        </div>
      </div>
    </section>
  );
}
