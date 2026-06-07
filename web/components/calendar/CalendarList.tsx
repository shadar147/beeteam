"use client";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { RU_MONTHS, STATE_META } from "@/lib/calendar";
import type { CalendarMeeting } from "@/lib/query/calendar";

const PILL: Record<string, "info" | "ok" | "miss"> = { planned: "info", done: "ok", miss: "miss" };

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarList({
  meetings, onSelect,
}: { meetings: CalendarMeeting[]; onSelect: (id: string) => void }) {
  if (meetings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-[13px] text-ink-3">
        Встреч нет
      </div>
    );
  }
  const sorted = [...meetings].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const groups: { key: string; label: string; items: CalendarMeeting[] }[] = [];
  for (const mt of sorted) {
    const key = dayKey(mt.date);
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, label: dayLabel(mt.date), items: [] }; groups.push(g); }
    g.items.push(mt);
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-1 text-[12px] font-medium text-ink-3 tabular">{g.label}</div>
          <div className="rounded-lg border border-line bg-bg-elev">
            {g.items.map((mt) => (
              <button key={mt.id} type="button" onClick={() => onSelect(mt.id)}
                className="flex w-full items-center gap-3 border-b border-line-2 px-3 py-2.5 text-left last:border-b-0 hover:bg-bg-tint">
                <span className="w-12 shrink-0 text-[12px] text-ink-3 tabular">{hhmm(mt.date)}</span>
                <Avatar name={mt.member_name} hue={mt.hue} size="sm" />
                <span className="flex-1 truncate text-[13px] text-ink">{mt.member_name}</span>
                <Pill variant={PILL[mt.state] ?? "default"} dot>{STATE_META[mt.state]?.label ?? mt.state}</Pill>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
