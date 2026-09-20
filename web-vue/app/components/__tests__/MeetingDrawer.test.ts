import { render, screen } from "@testing-library/vue";
import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import MeetingDrawer from "../MeetingDrawer.vue";
import type { MeetingDetail, TemplateDetail } from "~/lib/query/meetings";

vi.mock("~/lib/query/profile", () => ({
  useMeeting: () => ({ data: ref(MEETING), isLoading: ref(false), isError: ref(false) }),
  useMemberFiles: () => ({ data: ref([]), refetch: () => {} }),
}));
vi.mock("~/lib/query/files", () => ({
  downloadFile: vi.fn(),
  useDeleteFile: () => ({ mutate: vi.fn() }),
}));
vi.mock("~/components/FileDropzone.vue", () => ({
  default: { render: () => null },
}));
vi.mock("~/lib/query/meetings", async (orig) => {
  const actual = await orig<typeof import("~/lib/query/meetings")>();
  return {
    ...actual,
    useTemplate: () => ({ data: ref(TEMPLATE), isLoading: ref(false), isError: ref(false) }),
    useMeetingAutosave: () => ({ schedule: vi.fn(), flush: vi.fn(), status: ref("idle") }),
    useCompleteMeeting: () => ({ mutate: vi.fn(), isPending: ref(false) }),
    useDeleteMeeting: () => ({ mutate: vi.fn(), isPending: ref(false) }),
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

describe("MeetingDrawer", () => {
  it("renders template fields and the planned footer", () => {
    render(MeetingDrawer, { props: { meetingId: "m1" }, global: { plugins: [VueQueryPlugin] } });
    expect(screen.getByText("Настроение")).toBeInTheDocument();
    expect(screen.getByText("Блокеры")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Завершить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeInTheDocument();
  });
});
