"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import type { Discipline, GradeLevel, MatrixCell } from "@/lib/query/grades";

export function GradeMatrix({ discipline, levels }: { discipline: Discipline; levels: GradeLevel[] }) {
  const [open, setOpen] = useState<{ block: string; code: string; text: string } | null>(null);
  const cols = [...levels].sort((a, b) => a.ord - b.ord);

  function cellOf(block: { cells: MatrixCell[] }, ord: number) {
    return block.cells.find((c) => c.level === ord);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-bg-elev p-2 text-[11px] font-medium text-ink-3">Блок</th>
            {cols.map((l) => (
              <th key={l.ord} className="min-w-[150px] p-2 text-[11px] font-medium text-ink-3 tabular">{l.code}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {discipline.blocks.map((b) => (
            <tr key={b.id} className="border-t border-line-2 align-top">
              <td className="sticky left-0 z-10 bg-bg-elev p-2 text-[12px] font-medium text-ink">{b.name}</td>
              {cols.map((l) => {
                const c = cellOf(b, l.ord);
                if (!c || !c.required || !c.text) {
                  return <td key={l.ord} className="p-2 text-center text-[12px] text-ink-4">—</td>;
                }
                return (
                  <td key={l.ord} className="p-1">
                    <button type="button"
                      onClick={() => setOpen({ block: b.name, code: l.code, text: c.text! })}
                      className="line-clamp-3 w-full rounded-md border border-line-2 bg-bg-tint p-1.5 text-left text-[11px] text-ink-2 hover:bg-bg-sunken">
                      {c.text}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {open && (
        <Modal title={`${open.block} · ${open.code}`} onClose={() => setOpen(null)}>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Что должен демонстрировать сотрудник на этом уровне</div>
          <p className="text-[13px] text-ink-2">{open.text}</p>
        </Modal>
      )}
    </div>
  );
}
