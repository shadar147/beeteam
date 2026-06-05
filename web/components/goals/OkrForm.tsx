"use client";
import { useState } from "react";
import { SegControl } from "@/components/SegControl";
import type { Goal } from "@/lib/query/profile";

export type OkrValues = {
  quarter: string; title: string; key_result: string; progress: number; status: string; due: string;
};

function isoToDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Current quarter in the seeded "Q{n} {year}" format, e.g. "Q2 2026". */
function currentQuarter(): string {
  const d = new Date();
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

export function OkrForm({
  initial, onSubmit, onDelete, pending, error,
}: {
  initial?: Goal;
  onSubmit: (v: OkrValues) => void;
  onDelete?: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [quarter, setQuarter] = useState(initial?.quarter ?? currentQuarter());
  const [title, setTitle] = useState(initial?.title ?? "");
  const [keyResult, setKeyResult] = useState(initial?.key_result ?? "");
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [status, setStatus] = useState(initial?.status ?? "ontrack");
  const [due, setDue] = useState(initial ? isoToDate(initial.due) : "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !keyResult.trim() || !due) return;
    onSubmit({
      quarter, title: title.trim(), key_result: keyResult.trim(),
      progress: Math.max(0, Math.min(100, progress)), status,
      due: new Date(due).toISOString(),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-[13px]">
      <Field label="Цель"><input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Ключевой результат"><input className={inp} value={keyResult} onChange={(e) => setKeyResult(e.target.value)} /></Field>
      <Field label="Квартал"><input className={inp} value={quarter} onChange={(e) => setQuarter(e.target.value)} /></Field>
      <Field label="Прогресс">
        <input type="number" min={0} max={100} className={inp} value={progress}
          onChange={(e) => setProgress(Number(e.target.value))} />
      </Field>
      <div>
        <div className="mb-1 text-[12px] text-ink-2">Статус</div>
        <SegControl
          options={[{ value: "ontrack", label: "В работе" }, { value: "risk", label: "Под риском" }, { value: "done", label: "Готово" }]}
          value={status} onChange={setStatus} />
      </div>
      <Field label="Срок"><input type="date" className={inp} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      <FormFooter pending={pending} error={error} onDelete={onDelete} />
    </form>
  );
}

const inp = "w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Associates the label with the control via the accessible name.
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-ink-2">{label}</span>
      {children}
    </label>
  );
}

export function FormFooter({
  pending, error, onDelete,
}: { pending: boolean; error: string | null; onDelete?: () => void }) {
  return (
    <>
      {error && <div className="rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12px] text-miss">{error}</div>}
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
          {pending ? "Сохранение…" : "Сохранить"}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={pending}
            className="ml-auto rounded-md border border-miss/40 px-3 py-1.5 text-[13px] text-miss disabled:opacity-60">
            Удалить
          </button>
        )}
      </div>
    </>
  );
}
