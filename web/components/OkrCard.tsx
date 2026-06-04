import { Pill } from "./Pill";
import type { Goal } from "@/lib/query/profile";

const STATUS: Record<string, { label: string; variant: "info" | "warn" | "ok" }> = {
  ontrack: { label: "В работе", variant: "info" },
  risk: { label: "Под риском", variant: "warn" },
  done: { label: "Готово", variant: "ok" },
};

function fmtDue(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function OkrCard({ okr, onEdit }: { okr: Goal; onEdit?: () => void }) {
  const s = STATUS[okr.status] ?? STATUS.ontrack;
  return (
    <div className="rounded-lg border border-line bg-bg-elev p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink">{okr.title}</span>
        <Pill variant={s.variant} dot>{s.label}</Pill>
        {onEdit && (
          <button type="button" onClick={onEdit} className="ml-1 text-[12px] text-ink-3 hover:text-ink">Изменить</button>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{okr.key_result}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-sunken">
        <div className="h-full rounded-full bg-brand" style={{ width: `${okr.progress}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3 tabular">
        <span>{okr.progress}%</span>
        <span>до {fmtDue(okr.due)}</span>
      </div>
    </div>
  );
}
