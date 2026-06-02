export function NoteBlock({ label, children }: { label: string; children?: React.ReactNode }) {
  const text = typeof children === "string" ? children.trim() : children;
  if (!text || (Array.isArray(text) && text.length === 0)) return null;
  return (
    <div className="rounded-md border border-line-2 bg-bg-tint p-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className="text-[13px] text-ink-2">{text}</div>
    </div>
  );
}
