import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OkrForm } from "../goals/OkrForm";
import { DevItemForm } from "../goals/DevItemForm";
import { CompetencyForm } from "../goals/CompetencyForm";

describe("Goals forms", () => {
  it("OkrForm submits entered values (due as ISO)", () => {
    const onSubmit = vi.fn();
    render(<OkrForm onSubmit={onSubmit} pending={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Цель"), { target: { value: "Ускорить" } });
    fireEvent.change(screen.getByLabelText("Ключевой результат"), { target: { value: "LCP<1.5s" } });
    fireEvent.change(screen.getByLabelText("Прогресс"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Срок"), { target: { value: "2026-07-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const body = onSubmit.mock.calls[0][0];
    expect(body.title).toBe("Ускорить");
    expect(body.progress).toBe(60);
    expect(body.due).toMatch(/^2026-07-01T/);
  });

  it("CompetencyForm submits label + numeric score", () => {
    const onSubmit = vi.fn();
    render(<CompetencyForm onSubmit={onSubmit} pending={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Компетенция"), { target: { value: "Frontend" } });
    fireEvent.change(screen.getByLabelText("Оценка"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ label: "Frontend", score: 9 }));
  });

  it("DevItemForm submits title/kind/status", () => {
    const onSubmit = vi.fn();
    render(<DevItemForm onSubmit={onSubmit} pending={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Курс" } });
    fireEvent.change(screen.getByLabelText("Тип"), { target: { value: "Курс" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "Курс", kind: "Курс", status: "planned" }));
  });
});
