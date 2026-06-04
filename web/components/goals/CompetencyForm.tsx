"use client";
import { useState } from "react";
import { Field, FormFooter } from "./OkrForm";
import type { Competency } from "@/lib/query/profile";

export type CompetencyValues = { label: string; score: number };

const inp = "w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink";

export function CompetencyForm({
  initial, onSubmit, onDelete, pending, error,
}: {
  initial?: Competency;
  onSubmit: (v: CompetencyValues) => void;
  onDelete?: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [score, setScore] = useState(initial?.score ?? 5);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    onSubmit({ label: label.trim(), score: Math.max(0, Math.min(10, score)) });
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-[13px]">
      <Field label="Компетенция"><input className={inp} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field label="Оценка">
        <input type="number" min={0} max={10} className={inp} value={score}
          onChange={(e) => setScore(Number(e.target.value))} />
      </Field>
      <FormFooter pending={pending} error={error} onDelete={onDelete} />
    </form>
  );
}
