import { Clock } from "lucide-react";
import { Pill } from "@/components/Pill";
import { GradeChip } from "./GradeChip";

function fmt(d: string | null | undefined) {
  if (!d) return "не проводилось";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function GradeHero({
  gradeOrd,
  gradeCode,
  gradeName,
  disciplineLabel,
  targetOrd,
  targetCode,
  targetName,
  readyMonths,
  mgrTrack,
  nextReview,
  lastReview,
}: {
  gradeOrd: number;
  gradeCode: string;
  gradeName: string;
  disciplineLabel: string;
  targetOrd: number | null;
  targetCode: string | null;
  targetName: string | null;
  readyMonths: number;
  mgrTrack: boolean;
  nextReview: string | null;
  lastReview: string | null;
}) {
  const promoReady = targetOrd != null && targetOrd > gradeOrd;
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="flex flex-wrap items-center gap-4">
        <GradeChip ord={gradeOrd} code={gradeCode} size="xl" />
        <div>
          <div className="text-[18px] font-bold tracking-tight text-ink">{gradeName}</div>
          <div className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-3">
            <Pill variant="accent">{disciplineLabel}</Pill>
            текущий грейд{mgrTrack && " · менеджерский трек"}
          </div>
        </div>
      </div>

      {promoReady ? (
        <div className="mt-4 rounded-lg border border-line bg-bg-tint p-3.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink">
              Цель: {targetCode} {targetName}
            </span>
            <Pill variant="accent">
              <Clock size={11} /> {readyMonths}/3–6 мес
            </Pill>
          </div>
          <div className="relative h-2 rounded-full bg-bg-sunken">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min((readyMonths / 6) * 100, 100)}%` }} />
            <span className="absolute top-0 h-2 w-0.5 bg-brand-strong" style={{ left: "50%" }} title="минимум 3 мес" />
          </div>
          <div className="mt-1.5 text-[11.5px] text-ink-3">
            {readyMonths >= 3
              ? "Достаточно свидетельств для постановки на ближайшее ревью."
              : `Ещё ${3 - readyMonths} мес стабильного проявления до порога ревью.`}
          </div>
        </div>
      ) : (
        <div className="mt-4 text-[13px] text-ink-3">
          Уверенно держит уровень. Цель на повышение не выставлена.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-6 border-t border-line-2 pt-3 text-[12.5px]">
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-ink-4">Ближайшее ревью</div>
          <div className="text-ink-2">{fmt(nextReview)}</div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-ink-4">Прошлое ревью</div>
          <div className="text-ink-2">{fmt(lastReview)}</div>
        </div>
      </div>
    </div>
  );
}
