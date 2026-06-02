import { cn } from "@/lib/utils";
import type { DevItem } from "@/lib/query/profile";

const DOT: Record<string, string> = {
  in_progress: "bg-brand",
  planned: "border border-line-strong",
  done: "bg-ok",
};

export function DevItemRow({ item }: { item: DevItem }) {
  return (
    <div className="flex items-start gap-3 border-b border-line-2 py-2.5 last:border-b-0">
      <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", DOT[item.status] ?? DOT.planned)} />
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{item.title}</div>
        <div className="text-[11px] text-ink-3">
          {item.kind}{item.note ? <> · <span>{item.note}</span></> : ""}
        </div>
      </div>
    </div>
  );
}
