"use client";
import { cn } from "@/lib/utils";
import { RU_DOW, sameDay, shortName, STATE_META } from "@/lib/calendar";
import type { CalendarMeeting } from "@/lib/query/calendar";

export function CalendarMonth({
  month, today, meetings, onSelect,
}: {
  month: Date;
  today: Date;
  meetings: CalendarMeeting[];
  onSelect: (id: string) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, m, 1 - lead);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const dayMtgs = meetings.filter((x) => sameDay(new Date(x.date), d));
    return { d, dayMtgs, inMonth: d.getMonth() === m };
  });

  return (
    <div className="rounded-lg border border-line bg-bg-elev p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">
        {RU_DOW.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map(({ d, dayMtgs, inMonth }, i) => {
          const isToday = sameDay(d, today);
          const shown = dayMtgs.slice(0, 3);
          const extra = dayMtgs.length - shown.length;
          return (
            <div key={i}
              className={cn(
                "min-h-[84px] rounded-md border p-1",
                inMonth ? "border-line-2 bg-bg-elev" : "border-transparent bg-bg-tint/40",
                isToday && "ring-1 ring-brand",
              )}>
              <div className={cn("mb-0.5 text-right text-[11px] tabular", inMonth ? "text-ink-3" : "text-ink-4")}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {shown.map((mt) => (
                  <button key={mt.id} type="button" onClick={() => onSelect(mt.id)}
                    className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-ink-2 hover:bg-bg-tint">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_META[mt.state]?.dot ?? "bg-ink-4")} />
                    <span className="truncate">{shortName(mt.member_name)}</span>
                  </button>
                ))}
                {extra > 0 && <div className="px-1 text-[10px] text-ink-3">+{extra} ещё</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
