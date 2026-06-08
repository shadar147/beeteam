import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BlockProfile } from "../grades/BlockProfile";
import { CompaBand } from "../grades/CompaBand";
import { GradeEmptyState } from "../grades/GradeEmptyState";

describe("Member grade views", () => {
  it("BlockProfile marks above-grade, target and mastered segments", () => {
    render(
      <BlockProfile
        gradeOrd={4}
        targetOrd={5}
        levelCount={7}
        blocks={[{ name: "Базы данных", cur: 5 }]}
      />,
    );
    const ahead = document.querySelectorAll('[data-seg="ahead"]');
    const target = document.querySelectorAll('[data-seg="target"]');
    const fill = document.querySelectorAll('[data-seg="fill"]');
    expect(ahead.length).toBe(1);
    expect(fill.length).toBe(4);
    expect(target.length).toBe(0);
    expect(screen.getByText("Базы данных")).toBeInTheDocument();
  });

  it("BlockProfile shows a target gap when below target", () => {
    render(
      <BlockProfile
        gradeOrd={2}
        targetOrd={3}
        levelCount={7}
        blocks={[{ name: "Архитектура", cur: 2 }]}
      />,
    );
    expect(document.querySelectorAll('[data-seg="target"]').length).toBe(1);
  });

  it("CompaBand positions the marker by compa", () => {
    render(<CompaBand compa={0.62} gradeCode="IC5" />);
    const marker = document.querySelector('[data-testid="compa-marker"]') as HTMLElement;
    expect(marker.style.left).toBe("62%");
  });

  it("GradeEmptyState renders the not-assigned message", () => {
    render(<GradeEmptyState />);
    expect(screen.getByText("Грейд не назначен")).toBeInTheDocument();
  });
});
