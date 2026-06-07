import { describe, it, expect } from "vitest";
import { shortName, STATE_META, monthRange, weekRange, listRange, sameDay } from "@/lib/calendar";

describe("calendar utils", () => {
  it("shortName → first name + initial", () => {
    expect(shortName("Анна Лебедева")).toBe("Анна Л.");
    expect(shortName("Борис")).toBe("Борис");
    expect(shortName("")).toBe("");
  });

  it("STATE_META maps states to labels", () => {
    expect(STATE_META.planned.label).toBe("Запланирована");
    expect(STATE_META.done.label).toBe("Проведена");
    expect(STATE_META.miss.label).toBe("Пропущена");
  });

  it("monthRange spans 42 days (6 weeks), Monday-aligned, covering the month", () => {
    const r = monthRange(new Date(2026, 5, 15)); // June 2026
    const from = new Date(r.from), to = new Date(r.to);
    expect((from.getDay() + 6) % 7).toBe(0); // Monday
    expect(Math.round((+to - +from) / 86_400_000)).toBe(42);
    expect(from <= new Date(2026, 5, 1)).toBe(true); // covers June 1
  });

  it("weekRange is 7 days Monday→Monday", () => {
    const r = weekRange(new Date(2026, 5, 17)); // a Wednesday
    const from = new Date(r.from), to = new Date(r.to);
    expect((from.getDay() + 6) % 7).toBe(0);
    expect(Math.round((+to - +from) / 86_400_000)).toBe(7);
  });

  it("listRange spans 35 days (−7…+28)", () => {
    const r = listRange(new Date(2026, 5, 15));
    const from = new Date(r.from), to = new Date(r.to);
    expect(Math.round((+to - +from) / 86_400_000)).toBe(35);
  });

  it("sameDay compares y/m/d", () => {
    expect(sameDay(new Date(2026, 5, 1, 9), new Date(2026, 5, 1, 23))).toBe(true);
    expect(sameDay(new Date(2026, 5, 1), new Date(2026, 5, 2))).toBe(false);
  });
});
