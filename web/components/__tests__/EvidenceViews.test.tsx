import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CompetencyCaptureView } from "../meeting/CompetencyCaptureView";

const GRADE = {
  gradeOrd: 4, gradeCode: "IC4", gradeName: "Middle+", disciplineLabel: "Backend",
  targetOrd: 5, targetCode: "IC5", readyMonths: 2,
};
const BLOCKS = [{ key: "stack", name: "Серверный стек" }, { key: "core", name: "Базы данных" }];
const LEVELS = [
  { ord: 1, code: "IC1" }, { ord: 2, code: "IC2" }, { ord: 3, code: "IC3" }, { ord: 4, code: "IC4" },
  { ord: 5, code: "IC5" }, { ord: 6, code: "IC6" }, { ord: 7, code: "IC7" },
];

describe("CompetencyCaptureView", () => {
  it("shows the no-grade fallback", () => {
    render(
      <CompetencyCaptureView grade={null} blocks={[]} growthHints={[]} levels={[]} logged={[]}
        onAdd={() => {}} onRemove={() => {}} />,
    );
    expect(screen.getByText(/не назначен грейд/)).toBeInTheDocument();
  });

  it("adds evidence with the selected block, level and demonstrated status", () => {
    const onAdd = vi.fn();
    render(
      <CompetencyCaptureView grade={GRADE} blocks={BLOCKS} growthHints={[]} levels={LEVELS} logged={[]}
        onAdd={onAdd} onRemove={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText("Блок"), { target: { value: "core" } });
    fireEvent.change(screen.getByLabelText("Заметка"), { target: { value: "профилировал N+1" } });
    fireEvent.click(screen.getByRole("button", { name: "Отметить IC5" }));
    expect(onAdd).toHaveBeenCalledWith("core", 5, "demonstrated", "профилировал N+1");
  });

  it("renders logged rows and removes", () => {
    const onRemove = vi.fn();
    render(
      <CompetencyCaptureView grade={GRADE} blocks={BLOCKS} growthHints={[]} levels={LEVELS}
        logged={[{ id: "e1", blockName: "Серверный стек", level: 4, status: "demonstrated", note: "ок" }]}
        onAdd={() => {}} onRemove={onRemove} />,
    );
    expect(screen.getByText("ок")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Удалить свидетельство" }));
    expect(onRemove).toHaveBeenCalledWith("e1");
  });
});
