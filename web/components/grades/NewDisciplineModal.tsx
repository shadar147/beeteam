"use client";
import { useState } from "react";
import { Layers, SlidersHorizontal, Sparkles, CircleCheck, Settings } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";

const ICONS = [
  { key: "layers", Icon: Layers },
  { key: "fields", Icon: SlidersHorizontal },
  { key: "spark", Icon: Sparkles },
  { key: "check", Icon: CircleCheck },
  { key: "settings", Icon: Settings },
];

export function NewDisciplineModal({
  bases, onCreate, onClose, creating,
}: {
  bases: { id: string; label: string }[];
  onCreate: (body: { label: string; icon: string; description: string; copy_from_discipline_id: string }) => void;
  onClose: () => void;
  creating: boolean;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("layers");
  const [base, setBase] = useState(bases[0]?.id ?? "");
  const valid = label.trim().length >= 2 && base !== "";

  return (
    <Modal title="Новая дисциплина" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Иконка</div>
          <div className="flex gap-2">
            {ICONS.map(({ key, Icon }) => (
              <button key={key} type="button" aria-label={`Иконка ${key}`} onClick={() => setIcon(key)}
                className={cn("grid h-9 w-9 place-items-center rounded-lg border",
                  icon === key ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-3 hover:bg-bg-tint")}>
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="disc-label" className="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">
            Название дисциплины
          </label>
          <input id="disc-label" value={label} onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand" />
        </div>
        <div>
          <label htmlFor="disc-desc" className="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">Описание</label>
          <input id="disc-desc" value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand" />
        </div>
        <div>
          <label htmlFor="disc-base" className="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">
            Скопировать структуру блоков из…
          </label>
          <select id="disc-base" value={base} onChange={(e) => setBase(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand">
            {bases.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">Отмена</button>
        <button type="button" disabled={!valid || creating}
          onClick={() => onCreate({ label: label.trim(), icon, description: description.trim(), copy_from_discipline_id: base })}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
          Создать
        </button>
      </div>
    </Modal>
  );
}
