import { cn } from "@/lib/utils";

export type SegOption = { value: string; label: string };

export function SegControl({
  options,
  value,
  onChange,
  className,
}: {
  options: SegOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-line bg-bg-elev p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-seg={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 text-[12.5px] font-medium",
            value === o.value ? "bg-bg-tint text-ink shadow-1" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
