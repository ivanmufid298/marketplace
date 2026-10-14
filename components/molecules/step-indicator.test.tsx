// Run with `npm run test:ui`. The steps of a flow say where the shopper is, and let them go back to a finished one.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepIndicator } from "./step-indicator";

const labels = ["Alamat", "Pengiriman", "Pembayaran"];
const stateOf = (label: string) => {
  const el = screen.getByText(label);
  return el.classList.contains("active") ? "active" : el.classList.contains("done") ? "done" : "todo";
};
afterEach(cleanup);

describe("where the shopper is", () => {
  it("marks the current step, the finished ones before it, and the ones still to come", () => {
    render(<StepIndicator labels={labels} current={2} />);
    expect([stateOf("Alamat"), stateOf("Pengiriman"), stateOf("Pembayaran")]).toEqual(["done", "active", "todo"]);
  });
  it("tells assistive technology which step is current, and only that one", () => {
    render(<StepIndicator labels={labels} current={3} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((i) => i.getAttribute("aria-current"))).toEqual([null, null, "step"]);
  });
  it("is an ordered list of three, numbered by position", () => {
    render(<StepIndicator labels={labels} current={1} />);
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(labels.map((l) => screen.getByText(l).getAttribute("data-n"))).toEqual(["1", "2", "3"]);
  });
  it("marks every step done once the flow has finished", () => {
    render(<StepIndicator labels={labels} current={4} />);
    expect(labels.map(stateOf)).toEqual(["done", "done", "done"]);
    expect(screen.getAllByRole("listitem").some((i) => i.hasAttribute("aria-current"))).toBe(false);
  });
  it("marks the first step current at the start, with nothing done", () => {
    render(<StepIndicator labels={labels} current={1} />);
    expect(labels.map(stateOf)).toEqual(["active", "todo", "todo"]);
  });
});

describe("going back", () => {
  it("makes a finished step a button that goes back to it", () => {
    const onSelect = vi.fn();
    render(<StepIndicator labels={labels} current={3} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Alamat" }));
    fireEvent.click(screen.getByRole("button", { name: "Pengiriman" }));
    expect(onSelect.mock.calls).toEqual([[1], [2]]);
  });
  it("does not make the current step or a step to come a button", () => {
    render(<StepIndicator labels={labels} current={2} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Alamat"]);
  });
  it("makes no step a button on the first step", () => {
    render(<StepIndicator labels={labels} current={1} onSelect={vi.fn()} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("makes no step a button once the flow has finished, since there is nothing to go back to", () => {
    render(<StepIndicator labels={labels} current={4} onSelect={vi.fn()} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("makes no step a button when nothing is listening", () => {
    render(<StepIndicator labels={labels} current={3} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
