"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { Discipline, GradeLevel, MatrixCell } from "@/lib/query/grades";

export function GradeMatrix({ discipline, levels }: { discipline: Discipline; levels: GradeLevel[] }) {
  const [open, setOpen] = useState<{ block: string; code: string; name: string; text: string } | null>(null);
  const cols = [...levels].sort((a, b) => a.ord - b.ord);

  function cellOf(block: { cells: MatrixCell[] }, ord: number) {
    return block.cells.find((c) => c.level === ord);
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid min-w-[900px] gap-px overflow-hidden rounded-xl border border-line bg-line"
        style={{ gridTemplateColumns: `180px repeat(${cols.length}, minmax(150px, 1fr))` }}
      >
        {/* header row */}
        <div className="sticky left-0 z-20 bg-bg-tint px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Блок · уровень
        </div>
        {cols.map((l) => (
          <div key={l.ord} className="flex flex-col gap-px bg-brand px-3 py-2.5 text-[#1A1100]">
            <span className="text-[13px] font-extrabold tabular">{l.code}</span>
            <span className="text-[11px] font-semibold opacity-85">{l.name}</span>
          </div>
        ))}

        {/* body rows */}
        {discipline.blocks.map((b) => (
          <div key={b.id} className="contents">
            <div className="sticky left-0 z-10 flex items-center bg-bg-tint px-3.5 py-3.5 text-[12.5px] font-semibold text-ink">
              {b.name}
            </div>
            {cols.map((l) => {
              const c = cellOf(b, l.ord);
              const has = c?.required && c.text;
              if (!has) {
                return (
                  <div key={l.ord} className="bg-bg-tint p-3 text-[12px] italic leading-relaxed text-ink-4">
                    {c && !c.required ? "Не требуется." : "—"}
                  </div>
                );
              }
              return (
                <button
                  key={l.ord}
                  type="button"
                  onClick={() => setOpen({ block: b.name, code: l.code, name: l.name, text: c!.text! })}
                  className="bg-bg-elev p-3 text-left text-[12px] leading-relaxed text-ink-2 transition-colors hover:bg-brand-soft"
                >
                  {c!.text}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[12px] italic text-ink-3">
        Сотрудник уровня N владеет всеми компетенциями ≤N. Клик по ячейке — детали.
      </p>

      {open && (
        <Modal title={`${open.block} · ${open.code} ${open.name}`} onClose={() => setOpen(null)}>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">
            Что должен демонстрировать сотрудник на этом уровне
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">{open.text}</p>
        </Modal>
      )}
    </div>
  );
}
