import { cn } from "@/lib/utils";

const GLYPH: Record<string, { label: string; cls: string }> = {
  doc: { label: "DOC", cls: "bg-info-soft text-info" },
  img: { label: "IMG", cls: "bg-ok-soft text-ok" },
  pdf: { label: "PDF", cls: "bg-miss-soft text-miss" },
  video: { label: "MP4", cls: "bg-brand-soft text-brand-text" },
  sheet: { label: "XLS", cls: "bg-warn-soft text-warn" },
};

export function FileGlyph({ kind, size = 40 }: { kind: string; size?: number }) {
  const g = GLYPH[kind] ?? { label: "FILE", cls: "bg-bg-tint text-ink-3" };
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-md text-[10px] font-semibold", g.cls)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {g.label}
    </span>
  );
}
