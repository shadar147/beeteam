import { Sparkles } from "lucide-react";
import { Pill } from "@/components/Pill";
import { GradeChip } from "./GradeChip";
import type { GradeLevel } from "@/lib/query/grades";

export function GradeLevels({ levels }: { levels: GradeLevel[] }) {
  const rows = [...levels].sort((a, b) => a.ord - b.ord);
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-bg-tint p-3.5">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-brand-strong" />
        <p className="text-[13px] leading-relaxed text-ink-2">
          <b className="font-semibold text-ink">Принцип продвижения.</b>{" "}
          <span className="text-ink-3">
            Для перехода на следующий уровень сотрудник должен стабильно проявлять компетенции L+1
            минимум 3–6 месяцев, а не эпизодически.
          </span>
        </p>
      </div>

      {rows.map((l) => (
        <div
          key={l.ord}
          className="grid items-center gap-4 rounded-xl border border-line bg-bg-elev p-4 sm:gap-[18px]"
          style={{ gridTemplateColumns: "60px 200px 1fr 1fr" }}
        >
          <GradeChip ord={l.ord} code={l.code} />
          <div className="min-w-0">
            <div className="text-[14.5px] font-bold tracking-tight text-ink">{l.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
              {l.exp}
              {l.mgr && <Pill variant="info">+ менедж. трек</Pill>}
            </div>
          </div>
          <div>
            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Автономность</div>
            <div className="text-[12.5px] leading-snug text-ink-2">{l.autonomy}</div>
          </div>
          <div>
            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Масштаб влияния</div>
            <div className="text-[12.5px] leading-snug text-ink-2">{l.scope}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
