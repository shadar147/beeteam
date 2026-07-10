import { Shield } from "lucide-react";
import { GradeChip } from "./GradeChip";
import { formatTenge } from "@/lib/format";
import type { GradeLevel } from "@/lib/query/grades";

export function GradeBands({ levels, taxRate }: { levels: GradeLevel[]; taxRate?: number | null }) {
  const rows = [...levels].sort((a, b) => a.ord - b.ord);
  // Exact figures + a tax rate are co-gated by EditSalaryBands (either both present or both absent),
  // so require every row's bands AND the rate before showing money — avoids a misleading "ИПН 0%".
  const exact = rows.length > 0 && rows.every((l) => l.band_low != null) && taxRate != null;
  const rate = taxRate ?? 0;
  const cols = exact ? "170px 1fr 70px 190px 190px" : "200px 1fr 80px";

  return (
    <div className="space-y-3.5">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-bg-tint p-3.5">
        <Shield size={16} className="mt-0.5 shrink-0 text-brand-strong" />
        {exact ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            <b className="font-semibold text-ink">Точные оклады (₸/мес, до налога).</b>{" "}
            <span className="text-ink-3">
              «На руки» — с учётом ИПН {Math.round(rate * 100)}%. Вилки общие для всех дисциплин на одном грейде.
            </span>
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-2">
            <b className="font-semibold text-ink">Вид лида: полосы без точных окладов.</b>{" "}
            <span className="text-ink-3">
              Вилки общие для всех дисциплин на одном грейде. Точные цифры — у HR-администратора.
            </span>
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-bg-elev">
        <div
          className="grid items-center gap-4 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
          style={{ gridTemplateColumns: cols }}
        >
          <div>Грейд</div>
          <div>Полоса (нижняя → медиана → верхняя)</div>
          <div className="text-right">Разброс</div>
          {exact && <div className="text-right">Оклад (до налога)</div>}
          {exact && <div className="text-right">На руки · ИПН {Math.round(rate * 100)}%</div>}
        </div>

        {rows.map((l) => {
          const lowPct = l.band_shape.low * 100;
          const highPct = l.band_shape.high * 100;
          const midPct = l.band_shape.mid * 100;
          const spread = l.band_shape.mid > 0
            ? Math.round(((l.band_shape.high - l.band_shape.low) / (2 * l.band_shape.mid)) * 100) : 0;
          return (
            <div
              key={l.ord}
              className="grid items-center gap-4 border-t border-line-2 px-[18px] py-3.5"
              style={{ gridTemplateColumns: cols }}
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
              {exact && (
                <div className="text-right text-[12.5px] tabular text-ink">
                  {formatTenge(l.band_low!)} – {formatTenge(l.band_high!)}
                </div>
              )}
              {exact && (
                <div className="text-right text-[12.5px] tabular text-ink-2">
                  {formatTenge(l.band_low! * (1 - rate))} – {formatTenge(l.band_high! * (1 - rate))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
