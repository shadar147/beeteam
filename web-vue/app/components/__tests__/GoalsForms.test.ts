import { render, screen, fireEvent } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import OkrForm from "../goals/OkrForm.vue";
import DevItemForm from "../goals/DevItemForm.vue";
import CompetencyForm from "../goals/CompetencyForm.vue";

describe("Goals forms", () => {
  it("OkrForm submits entered values (due as ISO)", async () => {
    const { emitted } = render(OkrForm, { props: { pending: false, error: null } });
    await fireEvent.update(screen.getByLabelText("Цель"), "Ускорить");
    await fireEvent.update(screen.getByLabelText("Ключевой результат"), "LCP<1.5s");
    await fireEvent.update(screen.getByLabelText("Прогресс"), "60");
    await fireEvent.update(screen.getByLabelText("Срок"), "2026-07-01");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(emitted().submit).toHaveLength(1);
    const body = (emitted().submit as unknown[][])[0]![0] as { title: string; progress: number; due: string };
    expect(body.title).toBe("Ускорить");
    expect(body.progress).toBe(60);
    expect(body.due).toMatch(/^2026-07-01T/);
  });

  it("CompetencyForm submits label + numeric score", async () => {
    const { emitted } = render(CompetencyForm, { props: { pending: false, error: null } });
    await fireEvent.update(screen.getByLabelText("Компетенция"), "Frontend");
    await fireEvent.update(screen.getByLabelText("Оценка"), "9");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect((emitted().submit as unknown[][])[0]![0]).toEqual(expect.objectContaining({ label: "Frontend", score: 9 }));
  });

  it("DevItemForm submits title/kind/status", async () => {
    const { emitted } = render(DevItemForm, { props: { pending: false, error: null } });
    await fireEvent.update(screen.getByLabelText("Название"), "Курс");
    await fireEvent.update(screen.getByLabelText("Тип"), "Курс");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect((emitted().submit as unknown[][])[0]![0]).toEqual(expect.objectContaining({ title: "Курс", kind: "Курс", status: "planned" }));
  });
});
