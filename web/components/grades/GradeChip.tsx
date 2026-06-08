import { cn } from "@/lib/utils";

// Per-level chip colors ported from the prototype's `.grade-chip[data-lvl]` ramp
// (sunken → info → teal → ok → brand → amber-dark → purple). Tokens where they
// exist; arbitrary values for the three hues with no design token.
const LVL: Record<number, string> = {
  1: "bg-bg-sunken text-ink-3 border-line-strong",
  2: "bg-info-soft text-info border-info/25",
  3: "bg-[#E2F0EC] text-[#0E8C73] border-[#0E8C73]/25",
  4: "bg-ok-soft text-ok border-ok/25",
  5: "bg-brand-soft text-brand-strong border-brand/35",
  6: "bg-[#FBE3C6] text-[#B5650A] border-[#B5650A]/35",
  7: "bg-[#EAE2FB] text-[#6A4BD0] border-[#6A4BD0]/30",
};

export function GradeChip({
  ord,
  code,
  size = "md",
  className,
}: {
  ord: number;
  code: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-semibold tabular tracking-wide",
        size === "sm" ? "h-5 min-w-[30px] px-1.5 text-[10.5px]" : "h-[26px] min-w-[38px] px-2 text-[12.5px]",
        LVL[ord] ?? LVL[1],
        className,
      )}
    >
      {code}
    </span>
  );
}
