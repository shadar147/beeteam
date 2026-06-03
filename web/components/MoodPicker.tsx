"use client";
import { cn } from "@/lib/utils";

// Emoji → score: index 0..4 maps to 2/4/6/8/10.
const MOODS = ["😞", "😐", "🙂", "😄", "🤩"];

export function MoodPicker({
  value, score, onChange,
}: { value: string; score: number | null; onChange: (emoji: string, score: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {MOODS.map((e, i) => {
        const s = (i + 1) * 2;
        const active = e === value;
        return (
          <button
            key={e}
            type="button"
            aria-label={e}
            aria-pressed={active}
            onClick={() => onChange(e, s)}
            className={cn(
              "rounded-md px-2 py-1 text-[20px] leading-none",
              active ? "bg-brand-soft ring-1 ring-brand" : "hover:bg-bg-tint",
            )}
          >
            {e}
          </button>
        );
      })}
      <span className="ml-1 text-[12px] text-ink-3 tabular">{score != null ? `${score}/10` : "—"}</span>
    </div>
  );
}
