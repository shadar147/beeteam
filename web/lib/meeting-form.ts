import type { MeetingDetail } from "@/lib/query/profile";
import type { components } from "@/lib/api/schema";

export type UpdateMeetingRequest = components["schemas"]["UpdateMeetingRequest"];

/** Editable form state — development is a newline-joined textarea string; date is ISO. */
export type MeetingForm = {
  date: string;
  duration_min: number;
  mood: string;
  mood_score: number | null;
  blockers: string;
  goals: string;
  feedback_to: string;
  feedback_from: string;
  development: string;
  relationships: string;
};

export function formFromMeeting(m: MeetingDetail): MeetingForm {
  return {
    date: m.date,
    duration_min: m.duration_min,
    mood: m.mood ?? "",
    mood_score: m.mood_score ?? null,
    blockers: m.blockers ?? "",
    goals: m.goals ?? "",
    feedback_to: m.feedback_to ?? "",
    feedback_from: m.feedback_from ?? "",
    development: (m.development ?? []).join("\n"),
    relationships: m.relationships ?? "",
  };
}

export function formToPatch(f: MeetingForm): UpdateMeetingRequest {
  return {
    date: f.date,
    duration_min: f.duration_min,
    mood: f.mood,
    mood_score: f.mood_score ?? undefined,
    blockers: f.blockers,
    goals: f.goals,
    feedback_to: f.feedback_to,
    feedback_from: f.feedback_from,
    development: f.development.split("\n").map((s) => s.trim()).filter(Boolean),
    relationships: f.relationships,
  };
}

/** ISO ↔ <input type="datetime-local"> (local "YYYY-MM-DDTHH:mm") conversions. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

export type MeetingFormAction =
  | { type: "set"; field: keyof MeetingForm; value: string | number | null }
  | { type: "reset"; form: MeetingForm };

export function meetingFormReducer(state: MeetingForm, action: MeetingFormAction): MeetingForm {
  switch (action.type) {
    case "set":
      return { ...state, [action.field]: action.value };
    case "reset":
      return action.form;
  }
}
