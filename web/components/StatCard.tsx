import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  accentDot = false,
  danger = false,
  suffix,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accentDot?: boolean;
  danger?: boolean;
  suffix?: string;
}) {
  return (
    <div className="relative rounded-lg border border-line bg-bg-elev p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
      <div className={cn("mt-1 text-[26px] font-bold tabular", danger ? "text-miss" : "text-ink")}>
        {value}
        {suffix && <span className="ml-1 text-[14px] text-ink-3">{suffix}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
      {accentDot && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand" />}
    </div>
  );
}
