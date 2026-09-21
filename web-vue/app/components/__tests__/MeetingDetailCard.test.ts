import { render, screen } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import MeetingDetailCard from "../MeetingDetailCard.vue";
import type { MeetingDetail } from "~/lib/query/profile";

const DONE: MeetingDetail = {
  id: "m1", member_id: "x", date: "2026-05-25T09:00:00Z", state: "done",
  duration_min: 45, mood: "🙂", mood_score: 8,
  blockers: "Флака в CI", goals: "", feedback_to: "Хвалю", feedback_from: null,
  development: ["Курс по перфу"], relationships: "Тёплые",
};

function renderCard(meeting: MeetingDetail) {
  return render(MeetingDetailCard, {
    props: { meeting },
    global: { plugins: [createPinia(), VueQueryPlugin] },
  });
}

describe("MeetingDetailCard", () => {
  it("shows note blocks for a done meeting and hides empty ones", () => {
    renderCard(DONE);
    expect(screen.getByText("Завершена")).toBeInTheDocument();
    expect(screen.getByText("Флака в CI")).toBeInTheDocument();
    expect(screen.getByText("Курс по перфу")).toBeInTheDocument();
    expect(screen.queryByText("Цели")).not.toBeInTheDocument();
  });

  it("renders the planned CTA branch", () => {
    renderCard({ ...DONE, state: "planned", blockers: null, development: [] });
    expect(screen.getByText("Запланирована")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Провести сейчас" })).toBeInTheDocument();
  });
});
