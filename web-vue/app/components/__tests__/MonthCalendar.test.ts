import { render, screen, fireEvent } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import MonthCalendar from "../MonthCalendar.vue";

const MEETINGS = [
  { id: "m1", date: "2026-06-10T09:00:00Z", state: "done" },
  { id: "m2", date: "2026-06-20T09:00:00Z", state: "planned" },
];

const PROPS = {
  month: new Date("2026-06-01T00:00:00Z"),
  today: new Date("2026-06-15T00:00:00Z"),
  meetings: MEETINGS,
  selectedId: null,
};

describe("MonthCalendar", () => {
  it("renders the month title and a 6-week grid", () => {
    render(MonthCalendar, { props: PROPS });
    expect(screen.getByText(/Июнь 2026/i)).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });

  it("calls onSelect with the meeting id when a meeting-day is clicked", async () => {
    const { emitted } = render(MonthCalendar, { props: PROPS });
    // Pick the enabled button with text "10" (in-month, has meeting m1)
    const buttons = screen.getAllByRole("gridcell");
    const btn10 = buttons.find(
      (b) => b.textContent?.trim().startsWith("10") && !(b as HTMLButtonElement).disabled,
    );
    expect(btn10).toBeDefined();
    await fireEvent.click(btn10!);
    expect(emitted().select).toEqual([["m1"]]);
  });
});
