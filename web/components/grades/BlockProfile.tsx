import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Block = { name: string; cur: number };

function segClass(n: number, cur: number, gradeOrd: number, targetOrd: number | null) {
  if (n <= cur) return n > gradeOrd ? "ahead" : "fill";
  if (targetOrd && n <= targetOrd) return "target";
  return "empty";
}

const SEG_BG: Record<string, string> = {
  fill: "bg-brand",
  ahead: "bg-ok",
  target: "bg-brand-soft",
  empty: "bg-bg-sunken",
};

export function BlockProfile({
  blocks,
  gradeOrd,
  targetOrd,
  levelCount,
}: {
  blocks: Block[];
  gradeOrd: number;
  targetOrd: number | null;
  levelCount: number;
}) {
  const levels = Array.from({ length: levelCount }, (_, i) => i + 1);
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-3 text-[13px] font-semibold text-ink">Профиль по блокам</div>
      <div className="space-y-3">
        {blocks.map((b) => {
          const tone = b.cur > gradeOrd ? "text-ok" : targetOrd && b.cur < targetOrd ? "text-brand-strong" : "text-ink-2";
          return (
            <div key={b.name}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12.5px] text-ink-2">{b.name}</span>
                <span className={cn("flex items-center gap-1 text-[12px] font-semibold tabular", tone)}>
                  IC{b.cur}
                  {b.cur > gradeOrd && <TrendingUp size={11} />}
                </span>
              </div>
              <div className="relative flex gap-1">
                {levels.map((n) => {
                  const cls = segClass(n, b.cur, gradeOrd, targetOrd);
                  return <span key={n} data-seg={cls} className={cn("h-2 flex-1 rounded-sm", SEG_BG[cls])} />;
                })}
                <span
                  data-testid="grade-marker"
                  className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink"
                  style={{ left: `calc(${((gradeOrd - 0.5) / levelCount) * 100}%)` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-3">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-brand" /> освоено</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-ok" /> выше грейда</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-brand-soft" /> цель</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-0.5 rounded bg-ink" /> текущий грейд</span>
      </div>
    </div>
  );
}
