"use client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { RU_DOW, RU_MONTHS, sameDay, STATE_META } from "@/lib/calendar";
import type { CalendarMeeting } from "@/lib/query/calendar";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarSidebar({
  meetings, today, onSelect,
}: { meetings: CalendarMeeting[]; today: Date; onSelect: (id: string) => void }) {
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 21);
  const upcoming = meetings
    .filter((m) => m.state === "planned" && new Date(m.date) >= today && new Date(m.date) <= horizon)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, 6);

  // Week load: count meetings per weekday (Mon..Sun) within the current displayed set.
  const loads = [0, 0, 0, 0, 0, 0, 0];
  for (const m of meetings) {
    const idx = (new Date(m.date).getDay() + 6) % 7;
    loads[idx] += 1;
  }
  const maxLoad = Math.max(1, ...loads);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-bg-elev p-3">
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Ближайшие встречи</h3>
        {upcoming.length === 0 ? (
          <p className="text-[12px] text-ink-3">Ничего не запланировано</p>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onSelect(m.id)}
                  className="flex w-full items-center gap-2 rounded-md p-1 text-left hover:bg-bg-tint">
                  <span className="flex w-9 shrink-0 flex-col items-center">
                    <span className="text-[13px] font-semibold leading-none tabular">{new Date(m.date).getDate()}</span>
                    <span className="text-[10px] text-ink-3">{RU_MONTHS[new Date(m.date).getMonth()]}</span>
                  </span>
                  <Avatar name={m.member_name} hue={m.hue} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-ink">{m.member_name}</span>
                    <span className="block text-[10px] text-ink-3 tabular">{hhmm(m.date)} · {m.duration_min} мин</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-line bg-bg-elev p-3">
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Загрузка по неделе</h3>
        <div className="flex items-end justify-between gap-1" style={{ height: 64 }}>
          {loads.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t bg-brand" style={{ height: `${4 + (n / maxLoad) * 44}px` }} title={`${n}`} />
              <span className="text-[10px] text-ink-3">{RU_DOW[i]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-bg-elev p-3">
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Легенда</h3>
        <ul className="space-y-1 text-[12px] text-ink-2">
          {(["planned", "done", "miss"] as const).map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", STATE_META[s].dot)} />
              {STATE_META[s].label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
