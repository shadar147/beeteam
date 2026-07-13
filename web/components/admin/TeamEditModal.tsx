"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import type { AssignableLead, TeamInput, TeamRow } from "@/lib/query/teams";

const COLORS = ["#F5A524", "#3D6DCB", "#2D8F5C", "#C04A3B", "#7C5CBF", "#0E9AA7", "#D8870A", "#5B5644"];
const CADENCES: [string, string][] = [["1w", "Раз в неделю"], ["2w", "Раз в две недели"], ["4w", "Раз в месяц"]];
const VIS: [string, string][] = [["private", "Приватная"], ["hr", "HR"], ["org", "Вся компания"]];

export function TeamEditModal({
  initial, leads, saving, error, onClose, onSave,
}: {
  initial: TeamRow | null;
  leads: AssignableLead[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: TeamInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mission, setMission] = useState(initial?.mission ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [leadId, setLeadId] = useState<string>(initial?.lead_id ?? "");
  const [cadence, setCadence] = useState(initial?.default_cadence ?? "2w");
  const [visibility, setVisibility] = useState(initial?.visibility ?? "private");

  const valid = name.trim().length >= 2;
  const submit = () => {
    if (!valid) return;
    onSave({
      name: name.trim(),
      mission: mission.trim() === "" ? null : mission.trim(),
      color,
      lead_id: leadId === "" ? null : leadId,
      default_cadence: cadence,
      visibility,
    });
  };

  const input = "w-full rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand";

  return (
    <Modal title={initial ? "Редактировать команду" : "Новая команда"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <div className="rounded-md border border-miss/30 bg-miss-soft p-2.5 text-[12.5px] text-miss">{error}</div>}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Название</div>
          <input aria-label="Название команды" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Миссия</div>
          <input aria-label="Миссия" className={input} value={mission} onChange={(e) => setMission(e.target.value)} placeholder="Необязательно" />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Цвет</div>
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Цвет ${c}`} onClick={() => setColor(c)}
                className={cn("h-7 w-7 rounded-md border", color === c ? "ring-2 ring-brand ring-offset-1" : "border-line")}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Лид</div>
          <select aria-label="Лид" className={input} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">— не назначен —</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Регулярность 1-2-1</div>
          <select aria-label="Регулярность" className={input} value={cadence} onChange={(e) => setCadence(e.target.value)}>
            {CADENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Видимость</div>
          <select aria-label="Видимость" className={input} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60">Отмена</button>
          <button type="button" onClick={submit} disabled={!valid || saving}
            className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">Сохранить</button>
        </div>
      </div>
    </Modal>
  );
}
