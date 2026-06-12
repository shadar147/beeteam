import { cn } from "@/lib/utils";
import { Pill } from "@/components/Pill";
import type { ReviewScore } from "@/lib/query/reviews";

export function ScoresReadonly({ scores }: { scores: ReviewScore[] }) {
  const hasSelf = scores.every((s) => s.self_ord != null);
  return (
    <div className="space-y-1.5">
      {!hasSelf && (
        <p className="text-[12px] text-ink-3">Самооценка не получена — показана только оценка лида.</p>
      )}
      {scores.map((s) => {
        const gap = s.self_ord != null ? s.self_ord - s.lead_ord : null;
        return (
          <div key={s.block_id} className="flex items-center gap-3 rounded-lg bg-bg-tint px-3 py-2">
            <span className="w-[160px] truncate text-[12.5px] text-ink-2">{s.block_name}</span>
            <span className="text-[12px] tabular text-ink-3">
              {s.self_ord != null ? <>○ IC{s.self_ord}</> : "—"}
            </span>
            <span className={cn("text-[12px] font-semibold tabular text-ink")}>● IC{s.lead_ord}</span>
            <span className="ml-auto">
              {gap != null && gap !== 0 && (
                <Pill variant={Math.abs(gap) >= 2 ? "miss" : "warn"}>
                  расхождение {gap > 0 ? `+${gap}` : gap}
                </Pill>
              )}
              {gap === 0 && <Pill variant="ok" dot>совпадает</Pill>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
