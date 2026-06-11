import { Check, TrendingUp, Flag, ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type Decision = "hold" | "promote" | "pip";

function Band({ pct, accent }: { pct: number; accent?: boolean }) {
  return (
    <div className="relative flex h-5 items-center">
      <div className="absolute h-1.5 w-full rounded-full border border-line bg-gradient-to-r from-bg-sunken via-brand-soft to-brand" />
      <span
        className={cn("absolute h-3 w-3 -translate-x-1/2 rounded-full border-2 border-bg-elev shadow", accent ? "bg-brand-strong" : "bg-ink")}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

export function ReviewDecision({
  gradeOrd, gradeCode, nextCode, decision, onDecision, summary, onSummary, compa, lowBlocks,
}: {
  gradeOrd: number;
  gradeCode: string;
  nextCode: string;
  decision: Decision | null;
  onDecision: (d: Decision) => void;
  summary: string;
  onSummary: (s: string) => void;
  compa: number;
  lowBlocks: string[];
}) {
  const options: { id: Decision; icon: React.ReactNode; label: string; desc: string }[] = [
    { id: "hold", icon: <Check size={18} />, label: `Сохранить ${gradeCode}`, desc: "Уровень подтверждён, повышения пока нет" },
    ...(gradeOrd < 7
      ? [{ id: "promote" as Decision, icon: <TrendingUp size={18} />, label: `Повысить до ${nextCode}`, desc: "Стабильно проявляет компетенции следующего уровня" }]
      : []),
    { id: "pip", icon: <Flag size={18} />, label: "План улучшения (PIP)", desc: "Есть проседания, нужен фокус-план на квартал" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={decision === o.id}
            onClick={() => onDecision(o.id)}
            className={cn(
              "rounded-xl border p-4 text-left",
              decision === o.id
                ? o.id === "pip"
                  ? "border-miss/50 bg-miss-soft"
                  : "border-brand bg-brand-soft"
                : "border-line bg-bg-elev hover:bg-bg-tint",
            )}
          >
            <span className="text-ink-3">{o.icon}</span>
            <div className="mt-2 text-[13.5px] font-semibold text-ink">{o.label}</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{o.desc}</div>
          </button>
        ))}
      </div>

      {decision === "promote" && (
        <div className="rounded-xl border border-line bg-bg-elev p-5">
          <div className="text-[13px] font-semibold text-ink">Влияние на вилку</div>
          <div className="mb-4 text-[12px] text-ink-3">
            При повышении {gradeCode} → {nextCode} (вид лида, без точных окладов)
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-1 text-[10.5px] uppercase tracking-wide text-ink-4">сейчас · {gradeCode}</div>
              <Band pct={Math.round(compa * 100)} />
              <div className="mt-1 text-[11.5px] text-ink-3">{compa < 0.5 ? "ниже медианы" : "около медианы"}</div>
            </div>
            <ArrowRight size={18} className="shrink-0 text-ink-3" />
            <div className="flex-1">
              <div className="mb-1 text-[10.5px] uppercase tracking-wide text-ink-4">после · {nextCode}</div>
              <Band pct={22} accent />
              <div className="mt-1 text-[11.5px] text-ink-3">вход в новую полосу (нижняя часть)</div>
            </div>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            Повышение сбрасывает позицию в нижнюю часть новой, более высокой полосы — это нормально.
            Внеплановое ревью зарплаты запускается автоматически при подтверждении грейда.
          </p>
        </div>
      )}

      {decision === "pip" && (
        <div className="rounded-xl border border-miss/30 bg-bg-elev p-5">
          <div className="text-[13px] font-semibold text-miss">Фокус-план на квартал</div>
          <div className="mb-3 text-[12px] text-ink-3">Блоки ниже целевого уровня</div>
          {lowBlocks.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Все блоки на уровне грейда — уточните план в резюме.</p>
          ) : (
            <div className="space-y-1.5">
              {lowBlocks.map((name) => (
                <div key={name} className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
                  <span className="h-3.5 w-3.5 rounded border border-line-strong" /> {name} — дотянуть до {gradeCode}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-line bg-bg-elev p-5">
        <label htmlFor="review-summary" className="mb-2 block text-[13px] font-semibold text-ink">
          Резюме ревью
        </label>
        <textarea
          id="review-summary"
          rows={4}
          value={summary}
          onChange={(e) => onSummary(e.target.value)}
          placeholder="Ключевые достижения, обоснование решения, договорённости на следующий период…"
          className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
        />
        <div className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-3">
          <ShieldCheck size={14} /> Сотрудник увидит резюме и финальное решение после согласования с HR.
        </div>
      </div>
    </div>
  );
}
