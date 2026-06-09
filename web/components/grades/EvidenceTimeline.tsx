import { cn } from "@/lib/utils";
import type { Evidence } from "@/lib/query/evidence";

function fmt(d: string) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function EvidenceTimeline({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">Свидетельства из 1-2-1</div>
        <span className="rounded-full border border-line bg-bg-tint px-2 text-[11px] text-ink-3">{evidence.length}</span>
      </div>
      {evidence.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Пока нет зафиксированных свидетельств. Отмечайте проявленные компетенции во время 1-2-1.
        </p>
      ) : (
        <div className="space-y-2">
          {evidence.map((e) => (
            <div key={e.id} className="flex gap-2.5">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.status === "partial" ? "bg-warn" : "bg-ok")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-brand-soft px-1.5 text-[10px] text-brand-text">{e.block_name} · IC{e.level_ord}</span>
                  {e.status === "partial" && <span className="rounded-full bg-warn-soft px-1.5 text-[10px] text-warn">частично</span>}
                  <span className="ml-auto text-[11px] text-ink-4">{fmt(e.created_at)}</span>
                </div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{e.note || "без заметки"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
