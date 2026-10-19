// Run with `npm run test:ui`. Picking a place: the search box, its answers, and what the buyer can do when it does not work.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetDestinations } from "../lib/use-destination-search";
import type { Destination } from "../lib/types";
import { DestinationPicker } from "./destination-picker";

const place = (id: number, label = `TEMPAT ${id}, KOTA, DKI JAKARTA, 1234${id}`): Destination => ({ id, label, province: "DKI JAKARTA", city: "KOTA", district: "D", subdistrict: "S", postcode: `1234${id}` });
const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

function show(over: { fetchImpl?: typeof fetch; selected?: { id: number; label: string } | null } = {}) {
  const onSelect = vi.fn(); const onClear = vi.fn(); const onUnavailable = vi.fn();
  render(<DestinationPicker id="where" selected={over.selected ?? null} onSelect={onSelect} onClear={onClear} onUnavailable={onUnavailable} fetchImpl={over.fetchImpl ?? answer({ destinations: [] })} debounceMs={5} />);
  return { onSelect, onClear, onUnavailable };
}
const type = (value: string) => fireEvent.change(screen.getByRole("combobox"), { target: { value } });

beforeEach(() => forgetDestinations());
afterEach(cleanup);

describe("the search box", () => {
  it("is empty and says what to type, with nothing listed", () => {
    show();
    expect((screen.getByRole("combobox") as HTMLInputElement).placeholder).toBe("Ketik minimal 3 huruf, misalnya Kebayoran Baru atau 12150");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("lists the places it finds, in readable case, and hands over the one that is chosen", async () => {
    const { onSelect } = show({ fetchImpl: answer({ destinations: [place(1), place(2)] }) });
    type("tempat");
    const list = await screen.findByRole("listbox", { name: "Lokasi yang cocok" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Tempat 1Kota, DKI Jakarta · 12341", "Tempat 2Kota, DKI Jakarta · 12342"]);
    expect(within(list).getAllByRole("option")[0].querySelector("b")?.textContent).toBe("Tempat 1");
    expect(within(list).getAllByRole("option")[0].querySelector("small")?.textContent).toBe("Kota, DKI Jakarta · 12341");
    fireEvent.click(within(list).getByRole("option", { name: /Tempat 2/ }));
    expect(onSelect).toHaveBeenCalledWith(place(2));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("says it is searching, and says when nothing matched", async () => {
    show({ fetchImpl: answer({ destinations: [] }) });
    type("zzzz");
    expect((await screen.findByRole("status")).textContent).toBe("Mencari…");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Tidak ketemu. Coba kata lain, atau isi manual."));
  });
  it("says what is wrong, and tells the form, when the search cannot be used", async () => {
    const { onUnavailable } = show({ fetchImpl: answer({ error: "quota" }, 429) });
    type("jakarta");
    expect((await screen.findByRole("alert")).textContent).toBe("Pencarian lokasi sedang penuh hari ini. Isi manual saja.");
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledWith("quota"));
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });
  it("says it could not connect, in its own words", async () => {
    const { onUnavailable } = show({ fetchImpl: vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch });
    type("jakarta");
    expect((await screen.findByRole("alert")).textContent).toBe("Tidak bisa terhubung. Coba lagi, atau isi manual.");
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledWith("failed"));
  });
  it("tells the form once about a failure, even when the form gives it a new callback on every render", async () => {
    const calls = vi.fn();
    const props = { id: "where", selected: null, onSelect: vi.fn(), onClear: vi.fn(), fetchImpl: answer({ error: "unavailable" }, 503), debounceMs: 5 };
    const view = render(<DestinationPicker {...props} onUnavailable={(e) => calls(e)} />);
    type("jakarta");
    await screen.findByRole("alert");
    view.rerender(<DestinationPicker {...props} onUnavailable={(e) => calls(e)} />);
    view.rerender(<DestinationPicker {...props} onUnavailable={(e) => calls(e)} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveBeenCalledTimes(1);
    expect(calls).toHaveBeenCalledWith("unavailable");
  });
  it("does not complain before the buyer has searched for anything", async () => {
    const { onUnavailable } = show({ fetchImpl: answer({ error: "unavailable" }, 503) });
    await new Promise((r) => setTimeout(r, 30));
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("choosing with the keyboard and the mouse", () => {
  async function listed(onSelect = vi.fn()) {
    render(<DestinationPicker id="where" selected={null} onSelect={onSelect} onClear={vi.fn()} fetchImpl={answer({ destinations: [place(1), place(2), place(3)] })} debounceMs={5} />);
    type("tempat");
    await screen.findByRole("listbox");
    return { box: screen.getByRole("combobox"), options: () => screen.getAllByRole("option"), onSelect };
  }
  it("moves down and up the list with the arrow keys, wrapping round at both ends, and tells assistive technology which one it is on", async () => {
    const { box, options } = await listed();
    expect(options().map((o) => o.getAttribute("aria-selected"))).toEqual(["false", "false", "false"]);
    expect(box.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(options().map((o) => o.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(box.getAttribute("aria-activedescendant")).toBe(options()[0].id);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(options()[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(options()[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
    expect(options()[1].className).toBe("active");
  });
  it("keeps the arrow keys and Enter from doing their usual thing in the box (moving the cursor, sending the form) when they are used on the list", async () => {
    const { box } = await listed();
    expect(fireEvent.keyDown(box, { key: "ArrowDown" })).toBe(false);
    expect(fireEvent.keyDown(box, { key: "ArrowUp" })).toBe(false);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(false);
  });
  it("leaves Enter alone when no option is chosen, so the form's own check speaks", async () => {
    const { box } = await listed();
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(true);
  });
  it("starts from the last one when the first move is up", async () => {
    const { box, options } = await listed();
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(options()[2].getAttribute("aria-selected")).toBe("true");
  });
  it("chooses the one it is on with Enter, and does nothing with Enter before moving to one", async () => {
    const { box, onSelect } = await listed();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(place(2));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("closes the list with Escape, and opens it again with an arrow key or by typing", async () => {
    const { box } = await listed();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(box.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    type("tempat dua");
    expect(await screen.findByRole("listbox")).toBeTruthy();
  });
  it("ignores the arrow keys and Enter when there is nothing listed", async () => {
    const onSelect = vi.fn();
    render(<DestinationPicker id="where" selected={null} onSelect={onSelect} onClear={vi.fn()} fetchImpl={answer({ destinations: [] })} debounceMs={5} />);
    const box = screen.getByRole("combobox");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("marks the option under the mouse, and keeps the box focused when one is pressed so choosing it works on touch screens", async () => {
    const { options, box } = await listed();
    fireEvent.mouseEnter(options()[1]);
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
    expect(box.getAttribute("aria-activedescendant")).toBe(options()[1].id);
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    options()[1].dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });
  it("starts again from no option after typing something new", async () => {
    const { box } = await listed();
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-activedescendant")).not.toBeNull();
    type("tempat baru");
    await waitFor(() => expect(screen.getAllByRole("option").every((o) => o.getAttribute("aria-selected") === "false")).toBe(true));
    expect(box.getAttribute("aria-activedescendant")).toBeNull();
  });
});

describe("changing the place", () => {
  it("starts the search again from an empty box, without the old results", async () => {
    const onSelect = vi.fn();
    const props = { id: "where", onSelect, onClear: vi.fn(), fetchImpl: answer({ destinations: [place(1)] }), debounceMs: 5 };
    const view = render(<DestinationPicker {...props} selected={null} />);
    type("tempat");
    fireEvent.click(await screen.findByRole("option", { name: /Tempat 1/ }));
    view.rerender(<DestinationPicker {...props} selected={{ id: 1, label: place(1).label }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ganti" }));
    view.rerender(<DestinationPicker {...props} selected={null} />);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("a place that is already chosen", () => {
  it("is shown instead of the search box, with a way to change it", () => {
    const { onClear } = show({ selected: { id: 7, label: "CIPETE UTARA, KEBAYORAN BARU, JAKARTA SELATAN, DKI JAKARTA, 12150" } });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Cipete Utara")).toBeTruthy();
    expect(screen.getByText("Kebayoran Baru, Jakarta Selatan, DKI Jakarta · 12150")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ganti" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
