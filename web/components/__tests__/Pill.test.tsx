import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Pill } from "../Pill";

describe("Pill", () => {
  it("renders children and exposes the variant", () => {
    render(<Pill variant="ok" dot>В графике</Pill>);
    const el = screen.getByText("В графике").closest("[data-pill]")!;
    expect(el).toHaveAttribute("data-pill", "ok");
  });
});
