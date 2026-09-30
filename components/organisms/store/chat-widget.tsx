"use client";

import { useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import { CloseButton } from "../../atoms/close-button";
import { Icon } from "../../atoms/icon";
import { ChatBubble } from "../../molecules/chat-bubble";
import { useStore } from "../../providers/store-provider";

export function ChatWidget() {
  const { panels, togglePanel, closePanel, chatMessages, sendChat } = useStore();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [chatMessages]);

  return (
    <>
      <button type="button" className="chat-launcher" aria-label={t("store.chat.open")} onClick={() => togglePanel("chat")}>
        <span className="pulse" />
        <Icon name="chat" />
      </button>
      <section className={`chat-widget${panels.chat ? " open" : ""}`} aria-label={t("store.chat.label")}>
        <div className="chat-head">
          <span className="chat-avatar">A</span>
          <div><b>{t("store.chat.title")}</b><small>{t("store.chat.subtitle")}</small></div>
          <CloseButton label={t("store.chat.close")} onClick={() => closePanel("chat")} />
        </div>
        <div className="chat-messages" ref={box}>
          {chatMessages.map((m, i) => <ChatBubble key={i} from={m.from} text={m.text} meta={m.meta} />)}
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
          <input ref={input} placeholder={t("store.chat.placeholder")} autoComplete="off" />
          <button className="chat-send" aria-label={t("common.send")}><Icon name="send" /></button>
        </form>
      </section>
    </>
  );
}
