import type { Filters } from "~/lib/query/teams";

export function activeFilterCount(f: Filters): number {
  return (f.role ? 1 : 0) + (f.tenure ? 1 : 0) + (f.mood ? 1 : 0) +
    (f.since ? 1 : 0) + (f.tags?.length ?? 0);
}
