// Run with `npm run test:ui`. A number on the dashboard: plain, or a link to where it can be acted on.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MetricCard } from "./metric-card";

afterEach(cleanup);

describe("MetricCard", () => {
  it("shows the label, the value and the note, not as a link by default", () => {
    render(<MetricCard label="Pesanan" value="12" note="Semua beres" />);
    expect(screen.getByText("Pesanan")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Semua beres").className).not.toContain("down");
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("marks the note as a warning", () => {
    render(<MetricCard label="A" value="1" note="Perlu dicek" warn />);
    expect(screen.getByText("Perlu dicek").className).toContain("down");
  });
  it("becomes one link to where the number can be acted on", () => {
    render(<MetricCard label="Perlu dikirim" value="3" note="Isi resi" href="/admin/orders" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/admin/orders");
    expect(link.textContent).toContain("Perlu dikirim");
    expect(link.textContent).toContain("3");
  });
});
