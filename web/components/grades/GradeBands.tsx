import { Shield } from "lucide-react";
import { GradeChip } from "./GradeChip";
import type { GradeLevel } from "@/lib/query/grades";

export function GradeBands({ levels }: { levels: GradeLevel[] }) {
  const rows = [...levels].sort((a, b) => a.ord - b.ord);
  const maxHigh = Math.max(1, ...rows.map((l) => l.band_high));

  return (
    <div className="space-y-3.5">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-bg-tint p-3.5">
        <Shield size={16} className="mt-0.5 shrink-0 text-brand-strong" />
        <p className="text-[13px] leading-relaxed text-ink-2">
          <b className="font-semibold text-ink">Вид лида: полосы без точных окладов.</b>{" "}
          <span className="text-ink-3">
            Вилки общие для всех дисциплин на одном грейде. Точные цифры — у HR-администратора.
          </span>
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-bg-elev">
        <div
          className="grid items-center gap-4 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
          style={{ gridTemplateColumns: "200px 1fr 80px" }}
        >
          <div>Грейд</div>
          <div>Полоса (нижняя → медиана → верхняя)</div>
          <div className="text-right">Разброс</div>
        </div>

        {rows.map((l) => {
          const lowPct = (l.band_low / maxHigh) * 100;
          const highPct = (l.band_high / maxHigh) * 100;
          const midPct = (l.band_mid / maxHigh) * 100;
          const spread = l.band_mid > 0 ? Math.round(((l.band_high - l.band_low) / (2 * l.band_mid)) * 100) : 0;
          return (
            <div
              key={l.ord}
              className="grid items-center gap-4 border-t border-line-2 px-[18px] py-3.5"
              style={{ gridTemplateColumns: "200px 1fr 80px" }}
            >
              <div className="flex items-center gap-2.5">
                <GradeChip ord={l.ord} code={l.code} size="sm" />
                <span className="text-[13px] font-semibold text-ink">{l.name}</span>
              </div>
              <div className="relative flex h-7 items-center">
                <div
                  className="absolute h-2 rounded-full border border-line bg-gradient-to-r from-bg-sunken via-brand-soft to-brand"
                  style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
                />
                <div className="absolute h-3.5 w-0.5 rounded bg-ink-4" style={{ left: `${lowPct}%` }} />
                <div className="absolute h-[18px] w-0.5 rounded bg-brand-strong" style={{ left: `${midPct}%` }} />
                <div className="absolute h-3.5 w-0.5 rounded bg-ink-4" style={{ left: `calc(${highPct}% - 2px)` }} />
              </div>
              <div className="text-right text-[12.5px] tabular text-ink-2">±{spread}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
