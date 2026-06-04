"use client";
import { useState } from "react";
import { SegControl } from "@/components/SegControl";
import { Field, FormFooter } from "./OkrForm";
import type { DevItem } from "@/lib/query/profile";

export type DevItemValues = { title: string; kind: string; status: string; note: string };

const KINDS = ["Курс", "Доклад", "Книга", "Сертификат", "Менторство"];
const inp = "w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink";

export function DevItemForm({
  initial, onSubmit, onDelete, pending, error,
}: {
  initial?: DevItem;
  onSubmit: (v: DevItemValues) => void;
  onDelete?: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "");
  const [status, setStatus] = useState(initial?.status ?? "planned");
  const [note, setNote] = useState(initial?.note ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !kind.trim()) return;
    onSubmit({ title: title.trim(), kind: kind.trim(), status, note: note.trim() });
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-[13px]">
      <Field label="Название"><input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Тип">
        <input className={inp} list="dev-kinds" value={kind} onChange={(e) => setKind(e.target.value)} />
        <datalist id="dev-kinds">{KINDS.map((k) => <option key={k} value={k} />)}</datalist>
      </Field>
      <div>
        <div className="mb-1 text-[12px] text-ink-2">Статус</div>
        <SegControl
          options={[{ value: "planned", label: "Запланировано" }, { value: "in_progress", label: "В работе" }, { value: "done", label: "Готово" }]}
          value={status} onChange={setStatus} />
      </div>
      <Field label="Заметка"><input className={inp} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <FormFooter pending={pending} error={error} onDelete={onDelete} />
    </form>
  );
}
