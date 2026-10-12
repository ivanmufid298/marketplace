// Direct tests for the shared UI state. The same behavior is also pinned through useStore in
// components/providers/store-provider.test.tsx while StoreProvider still forwards it.
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiProvider, useUi } from "./ui-provider";

const wrapper = ({ children }: { children: ReactNode }) => <UiProvider>{children}</UiProvider>;
const mount = () => renderHook(() => useUi(), { wrapper });
const allClosed = (panels: Record<string, boolean>) => Object.values(panels).every((open) => !open);

beforeEach(() => {
  document.body.style.overflow = "";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("UiProvider", () => {
  it("starts with every panel closed and no toast", () => {
    const { result } = mount();
    expect(allClosed(result.current.panels)).toBe(true);
    expect(result.current.toast).toBe("");
  });

  it("opens, closes, toggles, and sets panels", () => {
    const { result } = mount();
    act(() => result.current.openPanel("chat"));
    expect(result.current.panels.chat).toBe(true);
    act(() => result.current.togglePanel("chat"));
    expect(result.current.panels.chat).toBe(false);
    act(() => result.current.setPanel("orders", true));
    expect(result.current.panels.orders).toBe(true);
    act(() => result.current.closePanel("orders"));
    expect(result.current.panels.orders).toBe(false);
  });

  it("closes everything on Escape", () => {
    const { result } = mount();
    act(() => {
      result.current.openPanel("drawer");
      result.current.openPanel("chat");
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(allClosed(result.current.panels)).toBe(true);
  });

  it("ignores other keys", () => {
    const { result } = mount();
    act(() => result.current.openPanel("drawer"));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(result.current.panels.drawer).toBe(true);
  });

  it("locks page scroll for covering panels only, and releases it on unmount", () => {
    const { result, unmount } = mount();
    act(() => result.current.openPanel("chat"));
    expect(document.body.style.overflow).toBe("");
    for (const id of ["drawer", "detail", "checkout", "categorySheet", "orders"] as const) {
      act(() => result.current.openPanel(id));
      expect(document.body.style.overflow, id).toBe("hidden");
      act(() => result.current.closePanel(id));
      expect(document.body.style.overflow, id).toBe("");
    }
    act(() => result.current.openPanel("drawer"));
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps scrolling locked while one of two covering panels is still open", () => {
    const { result } = mount();
    act(() => {
      result.current.openPanel("drawer");
      result.current.openPanel("detail");
    });
    act(() => result.current.closePanel("drawer"));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("clears the toast after 1.8 seconds, restarting the timer for a newer toast", () => {
    vi.useFakeTimers();
    const { result } = mount();
    act(() => result.current.showToast("Satu"));
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => result.current.showToast("Dua"));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.toast).toBe("Dua"); // the first timer must not clear the second toast
    act(() => { vi.advanceTimersByTime(801); });
    expect(result.current.toast).toBe("");
  });

  it("throws a clear error outside the provider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useUi())).toThrow("useUi must be used inside <UiProvider>");
    quiet.mockRestore();
  });
});
