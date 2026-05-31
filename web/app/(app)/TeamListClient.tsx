"use client";
import { useState } from "react";
import { Plus, Download, Search, Filter } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { SegControl } from "@/components/SegControl";
import { TeamTable } from "@/components/TeamTable";
import { FilterPopover, activeFilterCount } from "@/components/FilterPopover";
import { useTeamMembers, useTeamStats, type Filters } from "@/lib/query/teams";

const TABS = [
  { value: "all", label: "Все" },
  { value: "this-week", label: "На этой неделе" },
  { value: "overdue", label: "Просрочены" },
  { value: "attention", label: "Требуют внимания" },
];

export function TeamListClient({ teamId }: { teamId: string | null }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [popoverFilters, setPopoverFilters] = useState<Filters>({});
  const [showFilter, setShowFilter] = useState(false);

  const filters: Filters = {
    ...popoverFilters,
    q: q || undefined,
    since: tab === "overdue" ? "gt4w" : popoverFilters.since,
  };

  const stats = useTeamStats(teamId);
  const members = useTeamMembers(teamId, filters);

  const rows = (members.data ?? []).filter((m) => {
    if (tab === "attention") return m.status !== "ok";
    if (tab === "this-week") return Boolean(m.next_meet) &&
      (new Date(m.next_meet!).getTime() - Date.now()) <= 7 * 86_400_000 &&
      new Date(m.next_meet!).getTime() >= Date.now();
    return true;
  });

  const count = activeFilterCount(popoverFilters);

  return (
    <>
      <Topbar title="Моя команда" />
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight">Моя команда</h1>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {members.data?.length ?? "…"} человек · Платформенный отдел · Q2 2026
            </p>
          </div>
          <div className="flex gap-2">
            <button className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg-elev px-3 text-[13px]" title="Скоро">
              <Download size={14} /> Экспорт в Excel
            </button>
            <button className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg-elev px-3 text-[13px]" title="Скоро">
              <Plus size={14} /> Сотрудник
            </button>
            <button className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-semibold text-[#1A1100]" title="Скоро">
              <Plus size={14} /> Новая 1-2-1
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-4 gap-3">
          <StatCard label="На этой неделе" value={stats.data?.this_week ?? "…"} sub="запланировано встреч" accentDot />
          <StatCard label="Просрочены" value={stats.data?.overdue ?? "…"} danger={(stats.data?.overdue ?? 0) > 0}
            sub={(stats.data?.overdue ?? 0) > 0 ? "давно не виделись" : "все встречи в графике"} />
          <StatCard label="Среднее настроение" value={stats.data?.avg_mood ?? "…"} suffix="/10"
            sub={stats.data ? `${stats.data.avg_mood_delta >= 0 ? "↑ +" : "↓ "}${stats.data.avg_mood_delta} за месяц` : undefined} />
          <StatCard label="Заметок за квартал" value={stats.data?.notes_quarter ?? "…"} sub="по всей команде" />
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line bg-bg-elev px-3">
            <Search size={15} className="text-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по имени или роли"
              className="w-full bg-transparent text-[13px] outline-none"
            />
          </div>
          <SegControl options={TABS} value={tab} onChange={setTab} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilter((v) => !v)}
              className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg-elev px-3 text-[13px]"
            >
              <Filter size={13} /> Фильтр
              {count > 0 && <span className="ml-1 rounded-full bg-brand px-1.5 text-[11px] font-semibold text-[#1A1100]">{count}</span>}
            </button>
            {showFilter && (
              <FilterPopover value={popoverFilters} onApply={setPopoverFilters} onClose={() => setShowFilter(false)} />
            )}
          </div>
        </div>

        {members.isError ? (
          <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
            Не удалось загрузить команду.{" "}
            <button className="underline" onClick={() => members.refetch()}>Повторить</button>
          </div>
        ) : members.isLoading ? (
          <div className="rounded-lg border border-line bg-bg-elev p-10 text-center text-[13px] text-ink-3">Загрузка…</div>
        ) : (
          <TeamTable members={rows} />
        )}

        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-tint px-4 py-3.5 text-[13px] text-ink-3">
          <Plus size={14} />
          <span>Добавить сотрудника в команду — он получит приглашение по email</span>
          <button className="ml-auto rounded-md border border-line bg-bg-elev px-3 py-1.5 text-[13px]" title="Скоро">Добавить</button>
        </div>
      </div>
    </>
  );
}
