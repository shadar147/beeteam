import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/Pill";

export type AssessBlock = {
  blockId: string;
  name: string;
  selfOrd: number | null;
  leadOrd: number;
  evidenceCount: number;
  descByLevel: (string | null)[]; // index = ord - 1
};

export function ReviewAssess({
  blocks, levels, targetOrd, onSetLead,
}: {
  blocks: AssessBlock[];
  levels: { ord: number; code: string; name: string }[];
  targetOrd: number | null;
  onSetLead: (blockId: string, ord: number) => void;
}) {
  return (
    <div className="space-y-3.5">
      <div className="flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12.5px] text-ink-3">
        <Layers size={16} className="mt-0.5 shrink-0" />
        <div>
          Оцените каждый блок по матрице. <b className="text-ink-2">○</b> самооценка сотрудника,{" "}
          <b className="text-ink-2">●</b> ваша оценка.
          {targetOrd != null && <> Цель грейда — IC{targetOrd}.</>}
        </div>
      </div>

      {blocks.map((b) => {
        const gap = b.selfOrd != null ? b.selfOrd - b.leadOrd : null;
        return (
          <div key={b.blockId} data-testid={`assess-${b.blockId}`} className="rounded-xl border border-line bg-bg-elev p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-[13.5px] font-semibold text-ink">{b.name}</div>
                {b.evidenceCount > 0 && (
                  <div className="text-[11.5px] text-ink-4">{b.evidenceCount} свидетельств в 1-2-1</div>
                )}
              </div>
              {gap != null && gap !== 0 && (
                <Pill variant={Math.abs(gap) >= 2 ? "miss" : "warn"}>
                  расхождение {gap > 0 ? `+${gap}` : gap}
                </Pill>
              )}
              {gap === 0 && <Pill variant="ok" dot>совпадает</Pill>}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {levels.map((l) => {
                const isLead = b.leadOrd === l.ord;
                const isSelf = b.selfOrd === l.ord;
                const isTarget = targetOrd === l.ord;
                return (
                  <button
                    key={l.ord}
                    type="button"
                    aria-pressed={isLead}
                    title={`${l.code} ${l.name}`}
                    onClick={() => onSetLead(b.blockId, l.ord)}
                    className={cn(
                      "relative rounded-md border py-1.5 text-[11.5px] font-semibold tabular",
                      isLead
                        ? "border-brand bg-brand text-brand-text"
                        : "border-line text-ink-3 hover:bg-bg-tint",
                      isTarget && !isLead && "border-brand/50",
                    )}
                  >
                    {l.code}
                    {isSelf && <span className="absolute -top-1.5 right-0.5 text-[10px] text-ink-2" title="самооценка">○</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
              {b.descByLevel[b.leadOrd - 1] ?? "не требуется на этом уровне"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
