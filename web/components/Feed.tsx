"use client";
import { cn } from "@/lib/utils";
import type { MeetingListItem } from "@/lib/query/profile";

const TITLE: Record<string, string> = { done: "Завершена", planned: "Запланирована", miss: "Пропущена" };

function chip(iso: string) {
  const d = new Date(iso);
  return { day: d.getDate(), mon: d.toLocaleDateString("ru-RU", { month: "short" }) };
}

export function Feed({
  items, activeId, onSelect,
}: { items: MeetingListItem[]; activeId: string | null; onSelect: (id: string) => void }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-8 text-center text-[13px] text-ink-3">
        Встреч пока нет
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((m) => {
        const c = chip(m.date);
        const active = m.id === activeId;
        return (
          <button
            key={m.id}
            type="button"
            data-testid={`feed-item-${m.id}`}
            data-active={active}
            onClick={() => onSelect(m.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border p-3 text-left",
              active ? "border-brand bg-brand-soft" : "border-line bg-bg-elev hover:bg-bg-tint",
            )}
          >
            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-bg-tint text-ink-2">
              <span className="text-[15px] font-semibold leading-none tabular">{c.day}</span>
              <span className="text-[10px] text-ink-3">{c.mon}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink">{TITLE[m.state] ?? m.state}</span>
              <span className="line-clamp-2 text-[12px] text-ink-3">{m.preview}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
