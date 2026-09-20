export const SIZES = { sm: 24, md: 36, lg: 56, xl: 84 } as const;
export type Size = keyof typeof SIZES;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}
