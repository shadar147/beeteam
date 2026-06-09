"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { GradeChip } from "@/components/grades/GradeChip";

type Grade = {
  gradeOrd: number; gradeCode: string; gradeName: string; disciplineLabel: string;
  targetOrd: number | null; targetCode: string | null; readyMonths: number;
};
type LoggedRow = { id: string; blockName: string; level: number; status: string; note: string };
type Hint = { key: string; name: string; text: string };

export function CompetencyCaptureView({
  grade, blocks, growthHints, levels, logged, onAdd, onRemove,
}: {
  grade: Grade | null;
  blocks: { key: string; name: string }[];
  growthHints: Hint[];
  levels: { ord: number; code: string }[];
  logged: LoggedRow[];
  onAdd: (blockKey: string, level: number, status: string, note: string) => void;
  onRemove: (id: string) => void;
}) {
  const [block, setBlock] = useState("");
  const [note, setNote] = useState("");

  if (!grade) {
    return <p className="text-[13px] text-ink-3">У сотрудника не назначен грейд (другая карьерная лестница).</p>;
  }

  function add(level: number, status: string) {
    if (!block) return;
    onAdd(block, level, status, note.trim());
    setBlock(""); setNote("");
  }

  const promo = grade.targetOrd != null && grade.targetOrd > grade.gradeOrd;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-bg-tint p-2.5">
        <GradeChip ord={grade.gradeOrd} code={grade.gradeCode} size="sm" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">{grade.gradeName} · {grade.disciplineLabel}</div>
          <div className="text-[11.5px] text-ink-3">
            {promo ? `цель — ${grade.targetCode} · стабильно ${grade.readyMonths} мес` : "подтверждает текущий уровень"}
          </div>
        </div>
      </div>

      {growthHints.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Что важно увидеть для {grade.targetCode}</div>
          {growthHints.map((h) => (
            <button key={h.key} type="button" onClick={() => setBlock(h.key)}
              className={cn("flex w-full items-start gap-2 rounded-md border p-2 text-left",
                block === h.key ? "border-brand bg-brand-soft" : "border-line hover:bg-bg-tint")}>
              <span className="text-[12.5px] font-semibold text-ink">{h.name}</span>
              <span className="flex-1 text-[11.5px] text-ink-3">{h.text}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line p-3">
        <label htmlFor="ev-block" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-3">Блок</label>
        <select id="ev-block" aria-label="Блок" value={block} onChange={(e) => setBlock(e.target.value)}
          className="mb-2 w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink">
          <option value="">— выберите блок —</option>
          {blocks.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
        </select>
        <label htmlFor="ev-note" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-3">Заметка</label>
        <input id="ev-note" aria-label="Заметка" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Что конкретно проявил (контекст для ревью)…"
          className="mb-2 w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink" />
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Уровень проявления</div>
        <div className={cn("flex flex-wrap gap-1.5", !block && "pointer-events-none opacity-40")}>
          {levels.map((l) => (
            <button key={l.ord} type="button" aria-label={`Отметить ${l.code}`} onClick={() => add(l.ord, "demonstrated")}
              className="rounded-md border border-line p-0.5 hover:bg-bg-tint">
              <GradeChip ord={l.ord} code={l.code} size="sm" />
            </button>
          ))}
          <button type="button" disabled={!block} onClick={() => block && add(grade.gradeOrd, "partial")}
            className="rounded-md border border-line px-2 text-[11px] text-ink-3 hover:bg-bg-tint disabled:opacity-40">
            частично
          </button>
        </div>
      </div>

      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Отмечено в этой встрече ({logged.length})</div>
      {logged.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">
          Пока ничего. Свидетельства накапливаются от встречи к встрече — так видно, стабильно сотрудник проявляет уровень или эпизодически.
        </p>
      ) : (
        <div className="space-y-1.5">
          {logged.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-md border border-line p-2">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", c.status === "partial" ? "bg-warn" : "bg-ok")} />
              <span className="rounded-full bg-brand-soft px-1.5 text-[10px] text-brand-text">{c.blockName} · IC{c.level}</span>
              <span className="flex-1 truncate text-[12.5px] text-ink-2">{c.note || "без заметки"}</span>
              <button type="button" aria-label="Удалить свидетельство" onClick={() => onRemove(c.id)}
                className="text-ink-3 hover:text-ink">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
