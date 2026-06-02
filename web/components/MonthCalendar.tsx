"use client";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export type CalMeeting = { id: string; date: string; state: string };

const CHIP: Record<string, { glyph: string; cls: string }> = {
  done: { glyph: "✓", cls: "bg-ok-soft text-ok" },
  planned: { glyph: "○", cls: "bg-info-soft text-info" },
  miss: { glyph: "✕", cls: "bg-miss-soft text-miss" },
};

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function MonthCalendar({
  month,
  today,
  meetings,
  selectedId,
  onSelect,
  onMonthChange,
}: {
  month: Date;
  today: Date;
  meetings: CalMeeting[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMonthChange: (next: Date) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-based offset (JS getDay: 0=Sun)
  const start = new Date(year, m, 1 - lead);

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const mtg = meetings.find((x) => sameDay(new Date(x.date), d));
    return { d, mtg, inMonth: d.getMonth() === m };
  });

  return (
    <div className="rounded-lg border border-line bg-bg-elev p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="tabular text-[14px] font-semibold text-ink">
          {MONTHS[m]} {year}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Предыдущий месяц"
            className="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
            onClick={() => onMonthChange(new Date(year, m - 1, 1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] text-ink-2 hover:bg-bg-tint"
            onClick={() =>
              onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))
            }
          >
            Сегодня
          </button>
          <button
            type="button"
            aria-label="Следующий месяц"
            className="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
            onClick={() => onMonthChange(new Date(year, m + 1, 1))}
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div role="grid" className="mt-1 grid grid-cols-7 gap-1">
        {cells.map(({ d, mtg, inMonth }, i) => {
          const isToday = sameDay(d, today);
          const chip = mtg ? CHIP[mtg.state] : null;
          const selected = mtg && mtg.id === selectedId;
          return (
            <button
              key={i}
              role="gridcell"
              type="button"
              disabled={!mtg}
              onClick={() => mtg && onSelect(mtg.id)}
              className={cn(
                "relative flex h-9 items-center justify-center rounded text-[12px] tabular",
                inMonth ? "text-ink-2" : "text-ink-4",
                isToday && "ring-1 ring-brand",
                selected && "bg-brand-soft",
                mtg ? "hover:bg-bg-tint" : "cursor-default",
              )}
            >
              {d.getDate()}
              {chip && (
                <span
                  className={cn(
                    "absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full text-[8px] leading-3",
                    chip.cls,
                  )}
                >
                  {chip.glyph}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
