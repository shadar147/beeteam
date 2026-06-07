"use client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { RU_DOW, sameDay, STATE_META } from "@/lib/calendar";
import type { CalendarMeeting } from "@/lib/query/calendar";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarWeek({
  weekStart, today, meetings, onSelect,
}: {
  weekStart: Date; // Monday
  today: Date;
  meetings: CalendarMeeting[];
  onSelect: (id: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d, i) => {
        const dayMtgs = meetings
          .filter((x) => sameDay(new Date(x.date), d))
          .sort((a, b) => +new Date(a.date) - +new Date(b.date));
        const isToday = sameDay(d, today);
        return (
          <div key={i} className={cn("rounded-lg border bg-bg-elev p-2", isToday ? "border-brand" : "border-line")}>
            <div className="mb-2 text-[11px] text-ink-3">
              {RU_DOW[i]} <span className="tabular">{d.getDate()}</span>
            </div>
            <div className="space-y-1">
              {dayMtgs.map((mt) => (
                <button key={mt.id} type="button" onClick={() => onSelect(mt.id)}
                  className="flex w-full items-center gap-1.5 rounded-md border border-line-2 bg-bg-tint p-1.5 text-left hover:bg-bg-sunken">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_META[mt.state]?.dot ?? "bg-ink-4")} />
                  <Avatar name={mt.member_name} hue={mt.hue} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] text-ink">{mt.member_name}</span>
                    <span className="block text-[10px] text-ink-3 tabular">{hhmm(mt.date)} · {mt.duration_min} мин</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
