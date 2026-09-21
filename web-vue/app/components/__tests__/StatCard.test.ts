import { render, screen } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import StatCard from "../StatCard.vue";

describe("StatCard", () => {
  it("renders value + suffix", () => {
    render(StatCard, { props: { label: "Среднее настроение", value: 7.8, suffix: "/10" } });
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("/10")).toBeInTheDocument();
  });

  it("applies danger color to the value", () => {
    render(StatCard, { props: { label: "Просрочены", value: 3, danger: true } });
    expect(screen.getByText("3")).toHaveClass("text-miss");
  });
});
