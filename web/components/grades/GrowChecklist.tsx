import { cn } from "@/lib/utils";

type GrowItem = { blockName: string; targetCode: string; text: string; evidenceCount?: number };

export function GrowChecklist({ items, targetCode }: { items: GrowItem[]; targetCode: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="text-[13px] font-semibold text-ink">Что показать для {targetCode}</div>
      <div className="mb-3 text-[12px] text-ink-3">Конкретные компетенции из матрицы</div>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.blockName} className="flex gap-3">
            <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px]",
              (it.evidenceCount ?? 0) > 0 ? "border-ok bg-ok text-white" : "border-line")}>
              {(it.evidenceCount ?? 0) > 0 ? "✓" : ""}
            </span>
            <div>
              <div className="text-[13px] font-semibold text-ink">{it.blockName} → {it.targetCode}</div>
              <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{it.text}</div>
              {(it.evidenceCount ?? 0) > 0 && (
                <div className="mt-1 text-[11.5px] font-medium text-ok">{it.evidenceCount} свидетельств зафиксировано в 1-2-1</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
