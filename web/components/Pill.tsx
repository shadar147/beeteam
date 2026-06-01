import { cn } from "@/lib/utils";

type Variant = "default" | "ok" | "warn" | "miss" | "info" | "accent";

const STYLES: Record<Variant, string> = {
  default: "border-line bg-bg-elev text-ink-2",
  ok: "border-ok/30 bg-ok-soft text-ok",
  warn: "border-warn/30 bg-warn-soft text-warn",
  miss: "border-miss/30 bg-miss-soft text-miss",
  info: "border-info/30 bg-info-soft text-info",
  accent: "border-brand/30 bg-brand-soft text-brand-text",
};

export function Pill({
  variant = "default",
  dot = false,
  children,
  className,
}: {
  variant?: Variant;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      data-pill={variant}
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium",
        STYLES[variant],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
