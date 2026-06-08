import { Layers } from "lucide-react";

export function GradeEmptyState() {
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-7 text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-bg-tint text-ink-3">
        <Layers size={22} strokeWidth={1.5} />
      </span>
      <div className="text-[14px] font-semibold text-ink-2">Грейд не назначен</div>
      <div className="mt-1 text-[12.5px] text-ink-3">
        Эта роль использует другую карьерную лестницу (дизайн / менеджмент).
      </div>
    </div>
  );
}
