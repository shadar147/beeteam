import { Pill } from "@/components/Pill";
import type { GradeLevel } from "@/lib/query/grades";

export function GradeLevels({ levels }: { levels: GradeLevel[] }) {
  return (
    <div className="space-y-2">
      {levels.map((l) => (
        <div key={l.ord} className="rounded-lg border border-line bg-bg-elev p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-bg-tint px-2 py-0.5 text-[13px] font-semibold text-ink tabular">{l.code}</span>
            <span className="text-[14px] font-semibold text-ink">{l.name}</span>
            <span className="text-[12px] text-ink-3">· {l.exp}</span>
            {l.mgr && <Pill variant="info">менеджерский трек</Pill>}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-[12px] text-ink-2">
            <div><span className="text-ink-3">Автономия: </span>{l.autonomy}</div>
            <div><span className="text-ink-3">Масштаб: </span>{l.scope}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
