import { render, screen, fireEvent } from "@testing-library/vue";
import { describe, it, expect, vi } from "vitest";
import CalendarSidebar from "../calendar/CalendarSidebar.vue";
import type { CalendarMeeting } from "~/lib/query/calendar";

function mtg(id: string, date: string, state = "planned"): CalendarMeeting {
  return { id, member_id: "x", member_name: "Анна Лебедева", hue: 28, date, state, duration_min: 45 };
}

describe("CalendarSidebar", () => {
  it("renders the three widget headers", () => {
    render(CalendarSidebar, { props: { meetings: [], today: new Date(2026, 5, 15) } });
    expect(screen.getByText("Ближайшие встречи")).toBeInTheDocument();
    expect(screen.getByText("Загрузка по неделе")).toBeInTheDocument();
    expect(screen.getByText("Легенда")).toBeInTheDocument();
  });

  it("shows empty upcoming copy when no planned meetings", () => {
    render(CalendarSidebar, { props: { meetings: [], today: new Date(2026, 5, 15) } });
    expect(screen.getByText("Ничего не запланировано")).toBeInTheDocument();
  });

  it("lists an upcoming planned meeting and fires onSelect", async () => {
    const onSelect = vi.fn();
    const today = new Date(2026, 5, 15);
    const soon = new Date(2026, 5, 17, 11, 0).toISOString();
    render(CalendarSidebar, { props: { meetings: [mtg("m1", soon)], today, onSelect } });
    await fireEvent.click(screen.getByText("Анна Лебедева"));
    expect(onSelect).toHaveBeenCalledWith("m1");
  });
});
