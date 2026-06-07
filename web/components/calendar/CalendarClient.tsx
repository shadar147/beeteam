"use client";
import { useState } from "react";
import { SegControl } from "@/components/SegControl";
import { useTeamCalendar } from "@/lib/query/calendar";
import { useDrawerStore } from "@/lib/store/drawer";
import { monthRange, weekRange, listRange, mondayOf, RU_MONTHS_FULL, sameDay, RU_MONTHS, STATE_META } from "@/lib/calendar";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { CalendarMonth } from "./CalendarMonth";
import { CalendarWeek } from "./CalendarWeek";
import { CalendarList } from "./CalendarList";
import { CalendarSidebar } from "./CalendarSidebar";

type View = "month" | "week" | "list";

const PILL: Record<string, "info" | "ok" | "miss"> = { planned: "info", done: "ok", miss: "miss" };

export function CalendarClient({ teamId }: { teamId: string | null }) {
  // ALL hooks must be called before any early return (Rules of Hooks)
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [status, setStatus] = useState("all");
  const [dayModal, setDayModal] = useState<Date | null>(null);
  const open = useDrawerStore((s) => s.open);

  const today = new Date();

  // Compute range unconditionally so we can call useTeamCalendar below
  const range =
    view === "month" ? monthRange(anchor) :
    view === "week"  ? weekRange(anchor)  :
                       listRange(anchor);

  // enabled: teamId != null — no-ops when teamId is null
  const cal = useTeamCalendar(teamId, range.from, range.to);

  // ── early return AFTER all hooks ──────────────────────────────────────────
  if (teamId == null) {
    return (
      <div className="p-10 text-center text-[14px] text-ink-3">
        Календарь доступен лидам команды
      </div>
    );
  }

  const meetings = (cal.data ?? []).filter(
    (m) => status === "all" || m.state === status,
  );

  function shift(dir: -1 | 1) {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + 14 * dir);
    setAnchor(d);
  }

  const title =
    view === "month"
      ? `${RU_MONTHS_FULL[anchor.getMonth()]} ${anchor.getFullYear()}`
      : view === "week"
        ? `Неделя с ${mondayOf(anchor).getDate()} ${RU_MONTHS_FULL[mondayOf(anchor).getMonth()].toLowerCase()}`
        : "Список встреч";

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Календарь</h1>
          <p className="text-[13px] text-ink-3 tabular">
            Все 1-2-1 встречи команды · {title}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
          >
            .ics
          </button>
          <button
            type="button"
            className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
          >
            + Запланировать
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SegControl
            options={[
              { value: "month", label: "Месяц" },
              { value: "week",  label: "Неделя" },
              { value: "list",  label: "Список" },
            ]}
            value={view}
            onChange={(v) => setView(v as View)}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Назад"
              className="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
              onClick={() => shift(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-[12px] text-ink-2 hover:bg-bg-tint"
              onClick={() => setAnchor(new Date())}
            >
              Сегодня
            </button>
            <button
              type="button"
              aria-label="Вперёд"
              className="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
              onClick={() => shift(1)}
            >
              ›
            </button>
          </div>
        </div>
        <SegControl
          options={[
            { value: "all",     label: "Все" },
            { value: "planned", label: "Запланировано" },
            { value: "done",    label: "Проведено" },
            { value: "miss",    label: "Пропущено" },
          ]}
          value={status}
          onChange={setStatus}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-[1.7fr_minmax(280px,1fr)] gap-5">
        <div>
          {cal.isLoading ? (
            <div className="rounded-lg border border-line bg-bg-elev p-10 text-center text-[13px] text-ink-3">
              Загрузка…
            </div>
          ) : cal.isError ? (
            <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
              Не удалось загрузить календарь.{" "}
              <button className="underline" onClick={() => cal.refetch()}>
                Повторить
              </button>
            </div>
          ) : view === "month" ? (
            <CalendarMonth
              month={anchor}
              today={today}
              meetings={meetings}
              onSelect={open}
              onOpenDay={setDayModal}
            />
          ) : view === "week" ? (
            <CalendarWeek
              weekStart={mondayOf(anchor)}
              today={today}
              meetings={meetings}
              onSelect={open}
            />
          ) : (
            <CalendarList meetings={meetings} onSelect={open} />
          )}
        </div>
        <CalendarSidebar
          meetings={cal.data ?? []}
          today={today}
          onSelect={open}
        />
      </div>

      {dayModal && (
        <Modal
          title={`${dayModal.getDate()} ${RU_MONTHS[dayModal.getMonth()]} ${dayModal.getFullYear()}`}
          onClose={() => setDayModal(null)}
        >
          <ul className="space-y-1">
            {meetings
              .filter((m) => sameDay(new Date(m.date), dayModal))
              .sort((a, b) => +new Date(a.date) - +new Date(b.date))
              .map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => { open(m.id); setDayModal(null); }}
                    className="flex w-full items-center gap-3 rounded-md border border-line-2 px-3 py-2 text-left hover:bg-bg-tint"
                  >
                    <span className="w-12 shrink-0 text-[12px] text-ink-3 tabular">
                      {new Date(m.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <Avatar name={m.member_name} hue={m.hue} size="sm" />
                    <span className="flex-1 truncate text-[13px] text-ink">{m.member_name}</span>
                    <Pill variant={PILL[m.state] ?? "default"} dot>{STATE_META[m.state]?.label ?? m.state}</Pill>
                  </button>
                </li>
              ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
