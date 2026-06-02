import type { Competency } from "@/lib/query/profile";

export function CompetencyBar({ competency }: { competency: Competency }) {
  const pct = Math.max(0, Math.min(10, competency.score)) * 10;
  return (
    <div className="py-1.5">
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="text-ink-2">{competency.label}</span>
        <span className="text-ink-3 tabular">{competency.score}/10</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-sunken">
        <div data-testid="comp-fill" className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
