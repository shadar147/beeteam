import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NavItem } from "../NavItem";

describe("NavItem", () => {
  it("marks the active item with aria-current", () => {
    render(<NavItem label="Моя команда" icon="team" active count={8} />);
    const el = screen.getByText("Моя команда").closest("[data-nav-item]")!;
    expect(el).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("inactive item has no aria-current", () => {
    render(<NavItem label="Календарь" icon="calendar" />);
    const el = screen.getByText("Календарь").closest("[data-nav-item]")!;
    expect(el).not.toHaveAttribute("aria-current");
  });
});
