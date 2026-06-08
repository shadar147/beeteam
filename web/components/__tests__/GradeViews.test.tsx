import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GradeLevels } from "../grades/GradeLevels";
import { GradeMatrix } from "../grades/GradeMatrix";
import { GradeBands } from "../grades/GradeBands";
import type { GradeLevel, Discipline } from "@/lib/query/grades";

const LEVELS: GradeLevel[] = [
  { ord: 1, code: "IC1", name: "Trainee", exp: "0–6 мес", autonomy: "Менторство", scope: "Учеба", mgr: false, band_low: 0.78, band_mid: 1.0, band_high: 1.25 },
  { ord: 5, code: "IC5", name: "Senior", exp: "5+ лет", autonomy: "Архитектура", scope: "Сервис", mgr: true, band_low: 0.86, band_mid: 1.0, band_high: 1.14 },
];

const DISC: Discipline = {
  id: "d1", key: "backend", label: "Backend", icon: "fields", description: "API", ord: 0,
  blocks: [
    { id: "b1", key: "stack", name: "Серверный стек", ord: 0, cells: [
      { level: 1, text: "CRUD под руководством", required: true },
      { level: 2, text: "ORM, миграции", required: true },
    ] },
    { id: "b2", key: "arch", name: "Архитектура", ord: 1, cells: [
      { level: 1, text: null, required: false },
      { level: 2, text: "REST, HTTP", required: true },
    ] },
  ],
};

describe("Grade views", () => {
  it("GradeLevels lists levels with a manager badge", () => {
    render(<GradeLevels levels={LEVELS} />);
    expect(screen.getByText("IC1")).toBeInTheDocument();
    expect(screen.getByText("Trainee")).toBeInTheDocument();
    expect(screen.getByText("менеджерский трек")).toBeInTheDocument(); // only IC5 is mgr
  });

  it("GradeMatrix renders block rows and opens a cell modal", () => {
    render(<GradeMatrix discipline={DISC} levels={LEVELS} />);
    expect(screen.getByText("Серверный стек")).toBeInTheDocument();
    // a required cell shows truncated text; click → modal with full text
    fireEvent.click(screen.getByText("CRUD под руководством"));
    expect(screen.getByText(/Что должен демонстрировать/)).toBeInTheDocument();
  });

  it("GradeMatrix dims a not-required cell", () => {
    render(<GradeMatrix discipline={DISC} levels={LEVELS} />);
    // arch/IC1 is not required → rendered as «—», not clickable content
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("GradeBands renders a band per level", () => {
    render(<GradeBands levels={LEVELS} />);
    expect(screen.getByText("IC1")).toBeInTheDocument();
    expect(screen.getByText(/Точные цифры/)).toBeInTheDocument();
  });
});
