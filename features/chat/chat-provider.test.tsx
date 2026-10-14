// Run with `npm run test:ui`. The chat with the shop: its welcome, asking a guest to sign in, sending, the automatic reply,
// and coming back to an open chat after signing in. (These were the chat tests of the old StoreProvider; the assertions
// are the same, only the way the chat is reached changed.)
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/features/auth";
import { UiProvider, useUi } from "@/shared/ui-state/ui-provider";
import { AUTO_REPLY_MS, ChatProvider, useChat } from "./chat-provider";

const SESSION_KEY = "marketplace-demo-session-v1";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider><UiProvider><ChatProvider>{children}</ChatProvider></UiProvider></AuthProvider>
);
function mount() {
  const view = renderHook(() => ({ chat: useChat(), auth: useAuth(), ui: useUi() }), { wrapper });
  return { c: () => view.result.current.chat, a: () => view.result.current.auth, u: () => view.result.current.ui };
}
const mountSignedIn = () => {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
  return mount();
};
const run = (fn: () => void | Promise<void>) => act(async () => { await fn(); });

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("chat", () => {
  it("starts with the admin's welcome message", () => {
    const m = mount();
    expect(m.c().messages).toHaveLength(1);
    expect(m.c().messages[0].from).toBe("admin");
  });

  it("asks a guest to sign in instead of sending", async () => {
    const m = mount();
    await run(() => m.c().send("halo"));
    expect(m.c().messages).toHaveLength(1);
    expect(m.a().loginOpen).toBe(true);
    expect(m.a().intent).toBe("chat");
  });

  it("ignores empty messages, without asking a guest to sign in either", async () => {
    const guest = mount();
    await run(() => guest.c().send("   "));
    expect(guest.a().loginOpen).toBe(false);
    cleanup();
    const m = mountSignedIn();
    await run(() => m.c().send("   "));
    expect(m.c().messages).toHaveLength(1);
    expect(m.a().loginOpen).toBe(false);
  });

  it("sends a trimmed message and gets an automatic reply that keeps the same ticket id", async () => {
    vi.useFakeTimers();
    const m = mountSignedIn();
    await run(() => m.c().send("  halo  "));
    expect(m.c().messages.map((c) => [c.from, c.text])).toEqual([["admin", m.c().messages[0].text], ["user", "halo"]]);

    await act(async () => { vi.advanceTimersByTime(AUTO_REPLY_MS); });
    expect(m.c().messages).toHaveLength(3);
    const firstId = /INT-\d{6}/.exec(m.c().messages[2].text)?.[0];
    expect(firstId).toBeDefined();

    await run(() => m.c().send("lagi"));
    await act(async () => { vi.advanceTimersByTime(AUTO_REPLY_MS); });
    expect(/INT-\d{6}/.exec(m.c().messages[4].text)?.[0]).toBe(firstId);
  });

  it("answers after the delay, not before", async () => {
    vi.useFakeTimers();
    const m = mountSignedIn();
    await run(() => m.c().send("halo"));
    await act(async () => { vi.advanceTimersByTime(AUTO_REPLY_MS - 1); });
    expect(m.c().messages).toHaveLength(2);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(m.c().messages).toHaveLength(3);
  });

  it("labels each side's messages", async () => {
    vi.useFakeTimers();
    const m = mountSignedIn();
    await run(() => m.c().send("halo"));
    await act(async () => { vi.advanceTimersByTime(AUTO_REPLY_MS); });
    expect(m.c().messages.map((x) => x.meta)).toEqual(["Admin · sekarang", "Kamu · sekarang", "Sistem · sekarang"]);
  });

  it("opens the chat panel after a guest signs in to chat", async () => {
    const m = mount();
    await run(() => m.a().openLogin("chat"));
    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.u().panels.chat).toBe(true);
  });

  it("does not open the chat after signing in for something else", async () => {
    const m = mount();
    await run(() => m.a().openLogin("orders"));
    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.u().panels.chat).toBe(false);
  });

  it("does not open the chat just because someone is signed in", async () => {
    const m = mountSignedIn();
    await run(() => {});
    expect(m.u().panels.chat).toBe(false);
  });
});
