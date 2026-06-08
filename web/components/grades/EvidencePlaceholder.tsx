export function EvidencePlaceholder() {
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">Свидетельства из 1-2-1</div>
        <span className="rounded-full border border-line bg-bg-tint px-2 text-[11px] text-ink-3">0</span>
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Пока нет зафиксированных свидетельств. Отмечайте проявленные компетенции во время 1-2-1.
      </p>
    </div>
  );
}
