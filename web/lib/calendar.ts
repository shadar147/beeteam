export const RU_MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export const RU_MONTHS_FULL = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
export const RU_DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export const STATE_META: Record<string, { label: string; dot: string }> = {
  planned: { label: "Запланирована", dot: "bg-info" },
  done: { label: "Проведена", dot: "bg-ok" },
  miss: { label: "Пропущена", dot: "bg-miss" },
};

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Анна Лебедева" → "Анна Л."; single word unchanged. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

/** Monday on/before the given date. */
export function mondayOf(d: Date): Date {
  const lead = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - lead);
}

export type Range = { from: string; to: string };
const iso = (d: Date) => d.toISOString();
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** 6-week (42-day) window covering the anchor's month, Monday-aligned. */
export function monthRange(anchor: Date): Range {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = mondayOf(first);
  return { from: iso(start), to: iso(addDays(start, 42)) };
}

/** 7-day window for the anchor's week (Monday→next Monday). */
export function weekRange(anchor: Date): Range {
  const start = mondayOf(anchor);
  return { from: iso(start), to: iso(addDays(start, 7)) };
}

/** Agenda window: anchor−7 … anchor+28 (35 days). */
export function listRange(anchor: Date): Range {
  const start = addDays(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()), -7);
  return { from: iso(start), to: iso(addDays(start, 35)) };
}
