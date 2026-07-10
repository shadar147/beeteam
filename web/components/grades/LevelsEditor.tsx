import { Layers } from "lucide-react";
import { GradeChip } from "./GradeChip";
import type { DraftLevel } from "./editorTypes";

export function LevelsEditor({
  levels, onChange,
}: {
  levels: DraftLevel[];
  onChange: (ord: number, patch: Partial<Omit<DraftLevel, "ord" | "code">>) => void;
}) {
  const rows = [...levels].sort((a, b) => a.ord - b.ord);
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12.5px] text-ink-3">
        <Layers size={15} className="mt-0.5 shrink-0" />
        Уровни общие для всех дисциплин. Изменения коснутся всей системы грейдов.
      </div>
      {rows.map((l) => (
        <div key={l.ord} className="grid items-start gap-4 rounded-xl border border-line bg-bg-elev p-4"
          style={{ gridTemplateColumns: "60px 200px 1fr 1fr" }}>
          <GradeChip ord={l.ord} code={l.code} />
          <div className="space-y-1.5">
            <input aria-label="Название уровня" value={l.name}
              onChange={(e) => onChange(l.ord, { name: e.target.value })}
              className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand" />
            <input aria-label="Опыт" value={l.exp}
              onChange={(e) => onChange(l.ord, { exp: e.target.value })}
              className="w-full rounded-md border border-line bg-bg px-2 py-1 text-[12px] text-ink-2 outline-none focus:border-brand" />
          </div>
          <div>
            <div className="mb-0.5 text-[10.5px] uppercase tracking-wide text-ink-4">Автономность</div>
            <textarea aria-label="Автономность" rows={2} value={l.autonomy}
              onChange={(e) => onChange(l.ord, { autonomy: e.target.value })}
              className="w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink-2 outline-none focus:border-brand" />
          </div>
          <div>
            <div className="mb-0.5 text-[10.5px] uppercase tracking-wide text-ink-4">Масштаб влияния</div>
            <textarea aria-label="Масштаб влияния" rows={2} value={l.scope}
              onChange={(e) => onChange(l.ord, { scope: e.target.value })}
              className="w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink-2 outline-none focus:border-brand" />
          </div>
        </div>
      ))}
    </div>
  );
}
