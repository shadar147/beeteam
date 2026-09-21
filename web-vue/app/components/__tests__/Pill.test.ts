import { render, screen } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import Pill from "../Pill.vue";

describe("Pill", () => {
  it("renders children and exposes the variant", () => {
    render(Pill, { props: { variant: "ok", dot: true }, slots: { default: "В графике" } });
    const el = screen.getByText("В графике").closest("[data-pill]")!;
    expect(el).toHaveAttribute("data-pill", "ok");
  });
});
