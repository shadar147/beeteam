import { cn } from "@/lib/utils";

const SIZES = { sm: 24, md: 36, lg: 56, xl: 84 } as const;
type Size = keyof typeof SIZES;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function Avatar({
  name,
  hue,
  size = "md",
  className,
}: {
  name: string;
  hue: number;
  size?: Size;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <span
      className={cn("inline-flex items-center justify-center font-semibold tabular", className)}
      style={{
        width: px,
        height: px,
        fontSize: px * 0.4,
        background: `oklch(0.92 0.05 ${hue})`,
        color: `oklch(0.30 0.08 ${hue})`,
        borderRadius: size === "xl" ? 24 : 9999,
      }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
