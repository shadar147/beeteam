import { ArrowUp, ArrowDown, Trash2, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftBlock, DraftLevel } from "./editorTypes";

export function MatrixEditor({
  blocks, levels, onRename, onMove, onDelete, onAdd, onOpenCell,
}: {
  blocks: DraftBlock[];
  levels: DraftLevel[];
  onRename: (blockIdx: number, name: string) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (blockIdx: number) => void;
  onAdd: () => void;
  onOpenCell: (blockIdx: number, levelOrd: number) => void;
}) {
  const cols = [...levels].sort((a, b) => a.ord - b.ord);
  const cellOf = (b: DraftBlock, ord: number) => b.cells.find((c) => c.level === ord);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[900px] gap-px overflow-hidden rounded-xl border border-line bg-line"
          style={{ gridTemplateColumns: `220px repeat(${cols.length}, minmax(150px, 1fr))` }}>
          <div className="bg-bg-tint px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Блок · уровень
          </div>
          {cols.map((l) => (
            <div key={l.ord} className="flex flex-col gap-px bg-brand px-3 py-2.5 text-[#1A1100]">
              <span className="text-[13px] font-extrabold tabular">{l.code}</span>
              <span className="text-[11px] font-semibold opacity-85">{l.name}</span>
            </div>
          ))}

          {blocks.map((b, bi) => (
            <div key={b.id ?? `new-${bi}`} className="contents">
              <div className="flex items-center gap-1.5 bg-bg-tint px-2.5 py-2.5">
                <div className="flex flex-col">
                  <button type="button" aria-label="Блок вверх" disabled={bi === 0}
                    onClick={() => onMove(bi, bi - 1)}
                    className="text-ink-4 hover:text-ink disabled:opacity-30"><ArrowUp size={13} /></button>
                  <button type="button" aria-label="Блок вниз" disabled={bi === blocks.length - 1}
                    onClick={() => onMove(bi, bi + 1)}
                    className="text-ink-4 hover:text-ink disabled:opacity-30"><ArrowDown size={13} /></button>
                </div>
                <input aria-label="Имя блока" value={b.name}
                  onChange={(e) => onRename(bi, e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] font-semibold text-ink outline-none focus:border-brand" />
                <button type="button" aria-label="Удалить блок" onClick={() => onDelete(bi)}
                  className="text-ink-4 hover:text-miss"><Trash2 size={13} /></button>
              </div>
              {cols.map((l) => {
                const c = cellOf(b, l.ord);
                const empty = !(c && c.required && c.text);
                return (
                  <button key={l.ord} type="button" data-testid={`edit-cell-${b.id ?? `new-${bi}`}-${l.ord}`}
                    onClick={() => onOpenCell(bi, l.ord)}
                    className={cn(
                      "group relative flex items-center gap-1 p-3 text-left text-[12px] leading-relaxed transition-colors",
                      empty ? "bg-bg-tint text-ink-4 italic hover:bg-brand-soft" : "bg-bg-elev text-ink-2 hover:bg-brand-soft",
                    )}>
                    <span className="min-w-0 flex-1">
                      {c && !c.required ? "Не требуется." : c?.text || "добавить…"}
                    </span>
                    <Pencil size={11} className="shrink-0 text-ink-4 opacity-0 group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <button type="button" onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
        <Plus size={14} /> Добавить блок компетенций
      </button>
    </div>
  );
}
