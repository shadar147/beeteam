type GrowItem = { blockName: string; targetCode: string; text: string };

export function GrowChecklist({ items, targetCode }: { items: GrowItem[]; targetCode: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="text-[13px] font-semibold text-ink">Что показать для {targetCode}</div>
      <div className="mb-3 text-[12px] text-ink-3">Конкретные компетенции из матрицы</div>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.blockName} className="flex gap-3">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-line" />
            <div>
              <div className="text-[13px] font-semibold text-ink">
                {it.blockName} → {it.targetCode}
              </div>
              <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{it.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
