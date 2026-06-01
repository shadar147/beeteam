"use client";
import { useState } from "react";
import { SegControl } from "./SegControl";
import type { Filters } from "@/lib/query/teams";

const ROLES = ["Frontend", "Backend", "QA", "Design", "DevOps", "PM"];
const TAGS = ["Mentor", "Promotion", "Lead Track", "Onboarding", "Burnout risk", "PIP", "Performance"];

export function activeFilterCount(f: Filters): number {
  return (f.role ? 1 : 0) + (f.tenure ? 1 : 0) + (f.mood ? 1 : 0) +
    (f.since ? 1 : 0) + (f.tags?.length ?? 0);
}

export function FilterPopover({
  value,
  onApply,
  onClose,
}: {
  value: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(value);
  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleTag = (t: string) =>
    set({ tags: draft.tags?.includes(t) ? draft.tags.filter((x) => x !== t) : [...(draft.tags ?? []), t] });

  return (
    <div className="absolute right-0 z-20 mt-2 w-[320px] rounded-lg border border-line bg-bg-elev p-4 shadow-pop">
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Роль</div>
        <select
          className="h-9 w-full rounded-md border border-line bg-bg-elev px-2 text-[13px]"
          value={draft.role ?? ""}
          onChange={(e) => set({ role: e.target.value || undefined })}
        >
          <option value="">Все</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Стаж</div>
        <SegControl
          options={[
            { value: "", label: "Все" }, { value: "new", label: "<1 года" },
            { value: "mid", label: "1–3" }, { value: "sen", label: "3+" },
          ]}
          value={draft.tenure ?? ""}
          onChange={(v) => set({ tenure: v || undefined })}
        />
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Тренд настроения</div>
        <SegControl
          options={[
            { value: "", label: "Все" }, { value: "up", label: "↑" },
            { value: "flat", label: "→" }, { value: "down", label: "↓" },
          ]}
          value={draft.mood ?? ""}
          onChange={(v) => set({ mood: v || undefined })}
        />
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Теги</div>
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <button
              key={t}
              type="button"
              data-tag={t}
              aria-pressed={draft.tags?.includes(t) ?? false}
              onClick={() => toggleTag(t)}
              className={
                "rounded-full border px-2 py-0.5 text-[11.5px] " +
                (draft.tags?.includes(t)
                  ? "border-brand bg-brand-soft text-brand-text"
                  : "border-line text-ink-3 hover:text-ink-2")
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Последняя 1-2-1</div>
        <SegControl
          options={[
            { value: "", label: "Все" }, { value: "lt1w", label: "<1 нед" },
            { value: "lt2w", label: "<2 нед" }, { value: "gt4w", label: ">4 нед" },
          ]}
          value={draft.since ?? ""}
          onChange={(v) => set({ since: v || undefined })}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-[13px] text-ink-3 hover:bg-bg-tint"
          onClick={() => { const cleared = {}; setDraft(cleared); onApply(cleared); onClose(); }}
        >
          Сбросить
        </button>
        <button
          type="button"
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-[#1A1100]"
          onClick={() => { onApply(draft); onClose(); }}
        >
          Применить
        </button>
      </div>
    </div>
  );
}
