"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/features/auth";
import { t } from "@/lib/i18n";
import { useUi } from "@/shared/ui-state/ui-provider";

// The chat with the shop. Today the "admin" side is an automatic reply (a ticket id) and nothing is stored; the messages
// live in this browser until the chat moves to the database. A guest is asked to sign in before sending, and the chat
// opens by itself once they have.

export type ChatMessage = { from: "user" | "admin"; text: string; meta: string };

/** How long the automatic reply takes to appear, so it reads like an answer and not an echo. */
export const AUTO_REPLY_MS = 550;

type ChatContextValue = {
  messages: ChatMessage[];
  /** Sends a message. A guest is asked to sign in instead, and an empty message is ignored. */
  send: (text: string) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, loginOpen, intent, openLogin } = useAuth();
  const { setPanel } = useUi();
  const [messages, setMessages] = useState<ChatMessage[]>([{ from: "admin", text: t("store.chat.welcome"), meta: t("store.chat.metaAdmin") }]);
  const ticketId = useRef<string | null>(null);

  // A guest who chose "chat" and then signed in comes back to the chat, open.
  useEffect(() => {
    if (user && loginOpen && intent === "chat") setPanel("chat", true);
  }, [user, loginOpen, intent, setPanel]);

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message) return;
      if (!user) {
        openLogin("chat");
        return;
      }
      if (!ticketId.current) ticketId.current = "INT-" + String(Date.now()).slice(-6);
      const id = ticketId.current;
      setMessages((m) => [...m, { from: "user", text: message, meta: t("store.chat.metaUser") }]);
      setTimeout(() => setMessages((m) => [...m, { from: "admin", text: t("store.chat.autoReply", { id }), meta: t("store.chat.metaSystem") }]), AUTO_REPLY_MS);
    },
    [openLogin, user],
  );

  return <ChatContext.Provider value={{ messages, send }}>{children}</ChatContext.Provider>;
}
