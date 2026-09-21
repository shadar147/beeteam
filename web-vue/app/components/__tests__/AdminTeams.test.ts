import { render, screen, fireEvent } from "@testing-library/vue";
import { describe, it, expect, vi } from "vitest";
import TeamEditModal from "../admin/TeamEditModal.vue";
import type { AssignableLead, TeamRow } from "~/lib/query/teams";

const LEADS: AssignableLead[] = [{ id: "u1", name: "Евгений Глебов", hue: 40, role: "lead" }];

describe("TeamEditModal", () => {
  it("disables save until the name is ≥2 chars, then submits a TeamInput", async () => {
    const { emitted } = render(TeamEditModal, { props: { initial: null, leads: LEADS, saving: false, error: null } });
    const save = screen.getByRole("button", { name: "Сохранить" });
    expect(save).toBeDisabled();
    await fireEvent.update(screen.getByLabelText("Название команды"), "Mobile");
    expect(save).toBeEnabled();
    await fireEvent.update(screen.getByLabelText("Лид"), "u1");
    await fireEvent.click(save);
    expect(emitted().save![0]).toEqual([expect.objectContaining({
      name: "Mobile", lead_id: "u1", default_cadence: "2w", visibility: "private",
    })]);
  });

  it("prefills fields when editing an existing team", () => {
    const team: TeamRow = { id: "t1", name: "Платформа", mission: "миссия", color: "#3D6DCB",
      lead_id: "u1", lead_name: "Евгений Глебов", lead_hue: 40, member_count: 8, default_cadence: "1w", visibility: "hr" };
    render(TeamEditModal, { props: { initial: team, leads: LEADS, saving: false, error: null } });
    expect((screen.getByLabelText("Название команды") as HTMLInputElement).value).toBe("Платформа");
    expect(screen.getByRole("heading", { name: "Редактировать команду" })).toBeInTheDocument();
  });
});

vi.mock("~/lib/query/teams", async (orig) => {
  const actual = await orig<typeof import("~/lib/query/teams")>();
  const { ref } = await import("vue");
  return {
    ...actual,
    useTeams: () => ({ isLoading: ref(false), isError: ref(false), data: ref([
      { id: "t1", name: "Платформа", mission: null, color: "#F5A524", lead_id: "u1", lead_name: "Евгений Глебов", lead_hue: 40, member_count: 8, default_cadence: "2w", visibility: "private" },
      { id: "t2", name: "Internal", mission: null, color: "#F5A524", lead_id: null, lead_name: null, lead_hue: null, member_count: 0, default_cadence: "2w", visibility: "private" },
    ]) }),
    useAssignableLeads: () => ({ data: ref(LEADS) }),
    useCreateTeam: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
    useUpdateTeam: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
    useDeleteTeam: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  };
});

import TeamsAdminClient from "../admin/TeamsAdminClient.vue";

describe("TeamsAdminClient", () => {
  it("renders the header counts, rows, and «Без лида»", () => {
    render(TeamsAdminClient);
    expect(screen.getByText("2 команд · 8 сотрудников · 1 без лида")).toBeInTheDocument();
    expect(screen.getByText("Платформа")).toBeInTheDocument();
    expect(screen.getByText("Без лида")).toBeInTheDocument();
  });

  it("«Новая команда» opens the create modal", async () => {
    render(TeamsAdminClient);
    await fireEvent.click(screen.getByRole("button", { name: /Новая команда/ }));
    expect(screen.getByRole("heading", { name: "Новая команда" })).toBeInTheDocument();
  });
});
