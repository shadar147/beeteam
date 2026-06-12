import { Pill } from "@/components/Pill";
import type { Review } from "@/lib/query/reviews";

export const DECISION_LABEL: Record<string, string> = {
  hold: "грейд подтверждён",
  promote: "повышение",
  pip: "план улучшения",
};

function fmt(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function ReviewHistory({ reviews, codeOf }: { reviews: Review[]; codeOf: (ord: number) => string }) {
  const rows = reviews.filter((r) => r.status !== "draft");
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-2 text-[13px] font-semibold text-ink">История ревью</div>
      {rows.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Ревью ещё не проводились. Запустите первое из карточки грейда.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="border-b border-line-2 pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-semibold tabular text-ink">{r.period}</span>
                <span className="text-[12px] tabular text-ink-2">
                  {codeOf(r.from_grade_ord)} → {codeOf(r.to_grade_ord ?? r.from_grade_ord)}
                </span>
                {r.status === "pending"
                  ? <Pill variant="accent">на согласовании</Pill>
                  : r.decision && <span className="text-[11.5px] text-ink-3">{DECISION_LABEL[r.decision] ?? r.decision}</span>}
                <span className="ml-auto text-[11px] text-ink-4">{fmt(r.resolved_at ?? r.finalized_at)}</span>
              </div>
              {r.summary && <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{r.summary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
