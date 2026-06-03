import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeetingDrawer } from "../MeetingDrawer";
import type { MeetingDetail, TemplateDetail } from "@/lib/query/meetings";

vi.mock("@/lib/query/profile", () => ({
  useMeeting: () => ({ data: MEETING, isLoading: false, isError: false }),
}));
vi.mock("@/lib/query/meetings", async (orig) => {
  const actual = await orig<typeof import("@/lib/query/meetings")>();
  return {
    ...actual,
    useTemplate: () => ({ data: TEMPLATE, isLoading: false, isError: false }),
    useMeetingAutosave: () => ({ schedule: vi.fn(), flush: vi.fn(), status: "idle" }),
    useCompleteMeeting: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteMeeting: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

const MEETING: MeetingDetail = {
  id: "m1", member_id: "x", date: "2026-05-25T09:00:00Z", state: "planned",
  duration_min: 45, mood: "🙂", mood_score: 7, blockers: "B", goals: null,
  feedback_to: null, feedback_from: null, development: [], relationships: null, template_id: "t1",
};
const TEMPLATE: TemplateDetail = {
  id: "t1", name: "Базовый",
  fields: [
    { id: "f0", ord: 0, kind: "mood", title: "Настроение", required: false, placeholder: null, hint: null, options: [] },
    { id: "f1", ord: 1, kind: "longtext", title: "Блокеры", required: false, placeholder: "Что мешает?", hint: null, options: [] },
  ],
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("MeetingDrawer", () => {
  it("renders template fields and the planned footer", () => {
    render(wrap(<MeetingDrawer meetingId="m1" onClose={() => {}} />));
    expect(screen.getByText("Настроение")).toBeInTheDocument();
    expect(screen.getByText("Блокеры")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Завершить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeInTheDocument();
  });
});
