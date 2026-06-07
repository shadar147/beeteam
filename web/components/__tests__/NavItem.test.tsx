import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NavItem } from "../NavItem";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

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

  it("renders as a Link when href is provided and not disabled", () => {
    render(<NavItem label="Календарь" icon="calendar" href="/calendar" active />);
    const el = screen.getByText("Календарь").closest("[data-nav-item]")!;
    expect(el.tagName).toBe("A");
    expect(el).toHaveAttribute("href", "/calendar");
    expect(el).toHaveAttribute("aria-current", "page");
  });

  it("renders as a div when disabled even with href", () => {
    render(<NavItem label="Грейды" icon="layers" href="/grades" disabled />);
    const el = screen.getByText("Грейды").closest("[data-nav-item]")!;
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveAttribute("aria-disabled", "true");
  });
});
