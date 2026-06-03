import { describe, it, expect } from "vitest";
import { formFromMeeting, formToPatch, meetingFormReducer, toLocalInput, fromLocalInput } from "@/lib/meeting-form";
import type { MeetingDetail } from "@/lib/query/profile";

const M: MeetingDetail = {
  id: "m1", member_id: "x", date: "2026-05-25T09:00:00Z", state: "planned",
  duration_min: 45, mood: "🙂", mood_score: 7,
  blockers: "B", goals: null, feedback_to: null, feedback_from: null,
  development: ["a", "b"], relationships: null, template_id: "t1",
};

describe("meeting-form", () => {
  it("formFromMeeting joins development with newlines", () => {
    const f = formFromMeeting(M);
    expect(f.development).toBe("a\nb");
    expect(f.mood_score).toBe(7);
    expect(f.blockers).toBe("B");
  });

  it("formToPatch splits development into a trimmed array, dropping blank lines", () => {
    const f = { ...formFromMeeting(M), development: "x\n\n y \n" };
    const patch = formToPatch(f);
    expect(patch.development).toEqual(["x", "y"]);
  });

  it("reducer sets a field immutably", () => {
    const f = formFromMeeting(M);
    const next = meetingFormReducer(f, { type: "set", field: "blockers", value: "Z" });
    expect(next.blockers).toBe("Z");
    expect(f.blockers).toBe("B");
  });

  it("date round-trips through the datetime-local helpers", () => {
    const iso = "2026-05-25T09:00:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
});
