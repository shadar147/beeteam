import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MonthCalendar } from "../MonthCalendar";

const MEETINGS = [
  { id: "m1", date: "2026-06-10T09:00:00Z", state: "done" },
  { id: "m2", date: "2026-06-20T09:00:00Z", state: "planned" },
];

describe("MonthCalendar", () => {
  it("renders the month title and a 6-week grid", () => {
    render(
      <MonthCalendar
        month={new Date("2026-06-01T00:00:00Z")}
        today={new Date("2026-06-15T00:00:00Z")}
        meetings={MEETINGS}
        selectedId={null}
        onSelect={() => {}}
        onMonthChange={() => {}}
      />,
    );
    expect(screen.getByText(/Июнь 2026/i)).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });

  it("calls onSelect with the meeting id when a meeting-day is clicked", () => {
    const onSelect = vi.fn();
    render(
      <MonthCalendar
        month={new Date("2026-06-01T00:00:00Z")}
        today={new Date("2026-06-15T00:00:00Z")}
        meetings={MEETINGS}
        selectedId={null}
        onSelect={onSelect}
        onMonthChange={() => {}}
      />,
    );
    // Pick the enabled button with text "10" (in-month, has meeting m1)
    const buttons = screen.getAllByRole("gridcell");
    const btn10 = buttons.find(
      (b) => b.textContent?.startsWith("10") && !(b as HTMLButtonElement).disabled,
    );
    expect(btn10).toBeDefined();
    fireEvent.click(btn10!);
    expect(onSelect).toHaveBeenCalledWith("m1");
  });
});
