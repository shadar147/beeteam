"use client";
import { MoodPicker } from "./MoodPicker";
import type { FieldDef } from "@/lib/query/meetings";

export function FieldControl({
  field, value, moodScore, onChange, onMood,
}: {
  field: FieldDef;
  value: string;
  moodScore: number | null;
  onChange: (value: string) => void;
  onMood: (emoji: string, score: number) => void;
}) {
  const label = (
    <div className="mb-1 text-[12px] font-medium text-ink-2">{field.title}</div>
  );

  let control: React.ReactNode;
  switch (field.kind) {
    case "mood":
      control = <MoodPicker value={value} score={moodScore} onChange={onMood} />;
      break;
    case "longtext":
      control = (
        <textarea
          value={value}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-line bg-bg-elev p-2 text-[13px] text-ink"
        />
      );
      break;
    case "text":
    case "date":
      control = (
        <input
          type="text"
          value={value}
          placeholder={field.placeholder ?? (field.kind === "date" ? "ДД.ММ.ГГГГ" : "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink"
        />
      );
      break;
    case "scale":
      control = (
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(String(n))}
              className={cnScale(value === String(n))}
            >
              {n}
            </button>
          ))}
        </div>
      );
      break;
    case "select":
      control = (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink"
        >
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case "checklist":
      control = (
        <div className="space-y-1">
          {field.options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={value.split(",").includes(o)}
                onChange={(e) => {
                  const set = new Set(value.split(",").filter(Boolean));
                  if (e.target.checked) set.add(o); else set.delete(o);
                  onChange(Array.from(set).join(","));
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    case "file":
      control = (
        <div className="rounded-md border border-dashed border-line-strong bg-bg-tint p-3 text-center text-[12px] text-ink-3">
          Используйте раздел «Вложения» ниже
        </div>
      );
      break;
    default:
      control = (
        <div className="rounded-md border border-dashed border-line-strong bg-bg-tint p-3 text-center text-[12px] text-ink-3">
          Неизвестный тип поля
        </div>
      );
  }

  return <div className="py-2">{label}{control}</div>;
}

function cnScale(active: boolean): string {
  return `h-7 w-7 rounded text-[12px] tabular ${active ? "bg-brand text-brand-text" : "border border-line text-ink-2 hover:bg-bg-tint"}`;
}
