import { Scale, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";

export type CalibRow = {
  id: string;
  name: string;
  hue: number;
  avg: number;
  me: boolean;
  promo: boolean; // target above current grade
};

export function ReviewCalibrate({
  rows, gradeCode, targetCode, targetOrd, disciplineLabel, levels, avgLead,
}: {
  rows: CalibRow[];
  gradeCode: string;
  targetCode: string | null;
  targetOrd: number | null;
  disciplineLabel: string;
  levels: { ord: number; code: string }[];
  avgLead: number;
}) {
  const sorted = [...rows].sort((a, b) => b.avg - a.avg);
  return (
    <div className="space-y-3.5">
      <div className="flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12.5px] text-ink-3">
        <Scale size={16} className="mt-0.5 shrink-0" />
        <div>
          Калибровка выравнивает оценки между лидами, чтобы {gradeCode} у одного лида значил то же,
          что у другого. Сравнение по сотрудникам того же грейда.
        </div>
      </div>

      <div className="rounded-xl border border-line bg-bg-elev p-5">
        <div className="text-[13px] font-semibold text-ink">Распределение по грейду {gradeCode}</div>
        <div className="mb-4 text-[12px] text-ink-3">
          {disciplineLabel} · средний уровень по блокам · {sorted.length}{" "}
          {sorted.length === 1 ? "человек" : "человека"}
        </div>
        <div className="space-y-2.5">
          {sorted.map((p) => (
            <div key={p.id} className={cn("flex items-center gap-3", p.me && "rounded-lg bg-brand-soft/40 p-1.5 -m-1.5")}>
              <div className="flex w-[200px] shrink-0 items-center gap-2.5">
                <Avatar name={p.name} hue={p.hue} size="sm" />
                <span className={cn("truncate text-[13px]", p.me ? "font-bold text-ink" : "text-ink-2")}>
                  {p.name}{p.me && " (в ревью)"}
                </span>
              </div>
              <div className="relative h-2 flex-1 rounded-full bg-bg-sunken">
                <div className="h-2 rounded-full bg-brand" style={{ width: `${((p.avg - 1) / 6) * 100}%` }} />
                <span className="absolute -top-0.5 right-0 text-[11px] font-semibold tabular text-ink-2">
                  {p.avg.toFixed(1)}
                </span>
              </div>
              {p.promo
                ? <Pill variant="info">→ {targetCode ?? ""}</Pill>
                : <Pill>стабилен</Pill>}
            </div>
          ))}
        </div>
        {sorted.length === 1 && (
          <p className="mt-3 text-[12px] text-ink-3">
            Других сотрудников этого грейда в дисциплине пока нет — распределение появится по мере назначения грейдов.
          </p>
        )}
        <div className="mt-3 flex text-[10.5px] uppercase tracking-wide text-ink-4">
          {levels.map((l) => <span key={l.ord} className="flex-1">{l.code}</span>)}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-line bg-bg-elev p-4">
        <Sparkles size={18} className="shrink-0 text-ink-3" />
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          {targetOrd == null
            ? "Подтверждение текущего грейда — сравните позицию с распределением, чтобы зафиксировать уровень."
            : avgLead >= targetOrd
              ? `Средний уровень выше целевого ${targetCode} — кандидат сильнее медианы своего грейда. Повышение обосновано.`
              : `Средний уровень между ${gradeCode} и ${targetCode} — типично для кандидата в переходной фазе.`}
        </p>
      </div>
    </div>
  );
}
