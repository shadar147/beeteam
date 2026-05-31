import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatCard } from "../StatCard";

describe("StatCard", () => {
  it("renders value + suffix", () => {
    render(<StatCard label="Среднее настроение" value={7.8} suffix="/10" />);
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("/10")).toBeInTheDocument();
  });

  it("applies danger color to the value", () => {
    render(<StatCard label="Просрочены" value={3} danger />);
    expect(screen.getByText("3")).toHaveClass("text-miss");
  });
});
