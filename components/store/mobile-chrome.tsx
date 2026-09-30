"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CATEGORIES } from "@/lib/store-data";
import { CartIcon, ChatIcon, GridIcon, HeartIcon, HomeIcon, SendIcon } from "./icons";
import { useStore } from "./store-provider";

export function CategorySheet() {
  const { panels, closePanel, category, setCategory, scrollToProducts } = useStore();
  const pick = (c: string) => {
    setCategory(c);
    closePanel("categorySheet");
    setTimeout(scrollToProducts, 0);
  };
  return (
    <aside className={`category-sheet${panels.categorySheet ? " open" : ""}`} aria-hidden={!panels.categorySheet}>
      <div className="overlay" onClick={() => closePanel("categorySheet")} />
      <div className="sheet-card">
        <div className="sheet-grip" />
        <div className="sheet-title">
          <h3>Pilih kategori</h3>
          <button className="close" aria-label="Tutup" onClick={() => closePanel("categorySheet")}>×</button>
        </div>
        <div className="sheet-options">
          {["Semua", ...CATEGORIES].map((c) => (
            <button key={c} className={`sheet-option${category === c ? " active" : ""}`} onClick={() => pick(c)}>
              {c === "Semua" ? "Semua produk" : c}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const { mobileTab, mobileNav, cartCount } = useStore();
  const tab = (mode: string, label: string, icon: ReactNode, badge?: number) => (
    <button className={`mobile-tab${mobileTab === mode ? " active" : ""}`} onClick={() => mobileNav(mode)}>
      {badge !== undefined && <span className="mobile-count">{badge}</span>}
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="mobile-nav" aria-label="Navigasi utama">
      {tab("home", "Home", <HomeIcon />)}
      {tab("category", "Kategori", <GridIcon />)}
      {tab("saved", "Wishlist", <HeartIcon />)}
      {tab("cart", "Keranjang", <CartIcon />, cartCount)}
    </nav>
  );
}

export function ChatWidget() {
  const { panels, togglePanel, closePanel, chatMessages, sendChat } = useStore();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [chatMessages]);

  return (
    <>
      <button className="chat-launcher" aria-label="Chat dengan admin" onClick={() => togglePanel("chat")}>
        <span className="pulse" />
        <ChatIcon />
      </button>
      <section className={`chat-widget${panels.chat ? " open" : ""}`} aria-label="Chat admin">
        <div className="chat-head">
          <span className="chat-avatar">A</span>
          <div><b>Chat Admin</b><small>Biasanya membalas dalam beberapa menit</small></div>
          <button className="close" aria-label="Tutup chat" onClick={() => closePanel("chat")}>×</button>
        </div>
        <div className="chat-messages" ref={box}>
          {chatMessages.map((m, i) => (
            <div className={`bubble ${m.from}`} key={i}>
              {m.text}
              <div className="chat-time">{m.meta}</div>
            </div>
          ))}
        </div>
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.current) {
              sendChat(input.current.value);
              input.current.value = "";
            }
          }}
        >
          <input ref={input} placeholder="Tulis pesan…" autoComplete="off" />
          <button className="chat-send" aria-label="Kirim"><SendIcon /></button>
        </form>
      </section>
    </>
  );
}
