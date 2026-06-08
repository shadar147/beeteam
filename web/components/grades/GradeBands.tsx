import type { GradeLevel } from "@/lib/query/grades";

export function GradeBands({ levels }: { levels: GradeLevel[] }) {
  const cols = [...levels].sort((a, b) => a.ord - b.ord);
  const maxHigh = Math.max(1, ...cols.map((l) => l.band_high));
  return (
    <div className="rounded-lg border border-line bg-bg-elev p-4">
      <div className="space-y-2">
        {cols.map((l) => (
          <div key={l.ord} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-[12px] font-semibold text-ink tabular">{l.code}</span>
            <div className="relative h-3 flex-1 rounded-full bg-bg-sunken">
              <div
                className="absolute h-3 rounded-full bg-brand-soft"
                style={{ left: `${(l.band_low / maxHigh) * 100}%`, width: `${((l.band_high - l.band_low) / maxHigh) * 100}%` }}
              />
              <div className="absolute top-0 h-3 w-0.5 bg-brand" style={{ left: `${(l.band_mid / maxHigh) * 100}%` }} />
            </div>
            <span className="w-28 shrink-0 text-right text-[11px] text-ink-3 tabular">
              {l.band_low.toFixed(2)} · {l.band_mid.toFixed(2)} · {l.band_high.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">Точные цифры — у HR-администратора.</p>
    </div>
  );
}
