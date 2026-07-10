"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/Modal";

export function CellEditor({
  blockName, levelCode, levelName, initial, onApply, onClose,
}: {
  blockName: string;
  levelCode: string;
  levelName: string;
  initial: string | null;
  onApply: (cell: { text: string | null; required: boolean }) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(initial ?? "");
  const [na, setNa] = useState(initial === null);

  const apply = () => {
    if (na) onApply({ text: null, required: false });
    else onApply({ text: val, required: true });
    onClose();
  };

  return (
    <Modal title={`${blockName} · ${levelCode} ${levelName}`} onClose={onClose}>
      <label htmlFor="cell-text" className="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">
        Текст компетенции
      </label>
      <textarea
        id="cell-text"
        rows={5}
        value={na ? "" : val}
        disabled={na}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Опишите компетенцию как наблюдаемое поведение…"
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand disabled:opacity-50"
      />
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setNa((v) => !v)}
          className={`rounded-md border px-2.5 py-1.5 text-[12.5px] ${na ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-2 hover:bg-bg-tint"}`}>
          Отметить «не требуется»
        </button>
        <button type="button" onClick={() => { setNa(false); setVal(""); }}
          className="rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-ink-2 hover:bg-bg-tint">
          Очистить
        </button>
      </div>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12px] text-ink-3">
        <Sparkles size={14} className="mt-0.5 shrink-0" />
        Формулируйте как наблюдаемое поведение («проектирует…», «оптимизирует…»), а не как знание.
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
          Отмена
        </button>
        <button type="button" onClick={apply}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
          Применить
        </button>
      </div>
    </Modal>
  );
}
