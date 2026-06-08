"use client";
import { useState } from "react";
import { Layers, SlidersHorizontal, Sparkles, CircleCheck, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SegControl } from "@/components/SegControl";
import { useGradesFramework } from "@/lib/query/grades";
import { GradeLevels } from "./GradeLevels";
import { GradeMatrix } from "./GradeMatrix";
import { GradeBands } from "./GradeBands";

type Tab = "levels" | "matrix" | "bands";

// Seed icon keys (backend=fields, frontend=layers, mobile=spark, qa=check, devops=settings).
const DISC_ICONS: Record<string, LucideIcon> = {
  fields: SlidersHorizontal,
  layers: Layers,
  spark: Sparkles,
  check: CircleCheck,
  settings: Settings,
};

export function GradesClient() {
  const fw = useGradesFramework();
  const [disc, setDisc] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matrix");

  if (fw.isLoading) return <div className="p-6 text-[13px] text-ink-3">Загрузка…</div>;
  if (fw.isError)
    return (
      <div className="p-6">
        <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
          Не удалось загрузить грейды.{" "}
          <button className="underline" onClick={() => fw.refetch()}>Повторить</button>
        </div>
      </div>
    );

  const { levels, disciplines } = fw.data!;
  if (disciplines.length === 0) {
    return <div className="p-6 text-center text-[14px] text-ink-3">Карта грейдов пока не настроена</div>;
  }
  const activeKey = disc ?? disciplines[0].key;
  const active = disciplines.find((d) => d.key === activeKey) ?? disciplines[0];

  return (
    <div className="p-6">
      <div className="mb-[18px]">
        <h1 className="text-[20px] font-semibold text-ink">Грейды</h1>
        <p className="text-[13px] text-ink-3 tabular">Карта компетенций по дисциплинам · 7 уровней (IC1–IC7) · ревью раз в 6 мес</p>
      </div>

      {/* discipline cards */}
      <div className="mb-[18px] grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {disciplines.map((d) => {
          const Icon = DISC_ICONS[d.icon] ?? Layers;
          const on = d.key === activeKey;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setDisc(d.key)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors",
                on
                  ? "border-brand bg-brand-soft ring-[3px] ring-brand/10"
                  : "border-line bg-bg-elev hover:bg-bg-tint",
              )}
            >
              <span
                className={cn(
                  "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]",
                  on ? "bg-brand text-[#1A1100]" : "bg-bg-tint text-ink-3",
                )}
              >
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold tracking-tight text-ink">{d.label}</span>
                {d.description && <span className="block text-[11px] leading-snug text-ink-3">{d.description}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <SegControl
          options={[{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }, { value: "bands", label: "Вилки" }]}
          value={tab} onChange={(v) => setTab(v as Tab)} />
      </div>

      {tab === "levels" ? (
        <GradeLevels levels={levels} />
      ) : tab === "bands" ? (
        <GradeBands levels={levels} />
      ) : (
        <GradeMatrix discipline={active} levels={levels} />
      )}
    </div>
  );
}
