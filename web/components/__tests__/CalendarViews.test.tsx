import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CalendarMonth } from "../calendar/CalendarMonth";
import { CalendarList } from "../calendar/CalendarList";
import type { CalendarMeeting } from "@/lib/query/calendar";

function mtg(id: string, date: string, name = "Анна Лебедева"): CalendarMeeting {
  return { id, member_id: "x", member_name: name, hue: 28, date, state: "planned", duration_min: 45 };
}

describe("CalendarMonth", () => {
  const month = new Date(2026, 5, 1);
  const today = new Date(2026, 5, 15);

  it("shows up to 3 chips + overflow on a busy day", () => {
    const day = "2026-06-10T09:00:00Z";
    const meetings = [mtg("a", day, "Анна Лебедева"), mtg("b", day, "Борис Петров"), mtg("c", day, "Вера Сидорова"), mtg("d", day, "Глеб Орлов")];
    render(<CalendarMonth month={month} today={today} meetings={meetings} onSelect={() => {}} onOpenDay={() => {}} />);
    expect(screen.getByText("Анна Л.")).toBeInTheDocument();
    expect(screen.getByText(/\+1 ещё/)).toBeInTheDocument(); // 4 → 3 chips + "+1 ещё"
  });

  it("clicking a chip calls onSelect with the meeting id", () => {
    const onSelect = vi.fn();
    render(<CalendarMonth month={month} today={today} meetings={[mtg("m1", "2026-06-10T09:00:00Z")]} onSelect={onSelect} onOpenDay={() => {}} />);
    fireEvent.click(screen.getByText("Анна Л."));
    expect(onSelect).toHaveBeenCalledWith("m1");
  });

  it("clicking «+N ещё» calls onOpenDay with a Date for that day", () => {
    const onOpenDay = vi.fn();
    const day = "2026-06-10T09:00:00Z";
    const meetings = [mtg("a", day, "Анна Лебедева"), mtg("b", day, "Борис Петров"), mtg("c", day, "Вера Сидорова"), mtg("d", day, "Глеб Орлов")];
    render(<CalendarMonth month={month} today={today} meetings={meetings} onSelect={() => {}} onOpenDay={onOpenDay} />);
    fireEvent.click(screen.getByText(/\+1 ещё/));
    expect(onOpenDay).toHaveBeenCalledTimes(1);
    const arg = onOpenDay.mock.calls[0][0] as Date;
    expect(arg).toBeInstanceOf(Date);
    expect(arg.getDate()).toBe(10);
  });
});

describe("CalendarList", () => {
  it("renders rows and fires onSelect", () => {
    const onSelect = vi.fn();
    render(<CalendarList meetings={[mtg("m1", "2026-06-10T09:00:00Z")]} onSelect={onSelect} />);
    const row = screen.getByText("Анна Лебедева");
    expect(row).toBeInTheDocument();
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith("m1");
  });

  it("shows an empty state", () => {
    render(<CalendarList meetings={[]} onSelect={() => {}} />);
    expect(screen.getByText("Встреч нет")).toBeInTheDocument();
  });
});
