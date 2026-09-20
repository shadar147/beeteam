import { render, screen } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";
import NavItem from "../NavItem.vue";

function renderItem(props: InstanceType<typeof NavItem>["$props"]) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:all(.*)*", component: { template: "<div />" } }],
  });
  return render(NavItem, { props, global: { plugins: [router] } });
}

describe("NavItem", () => {
  it("marks the active item with aria-current", () => {
    renderItem({ label: "Моя команда", icon: "team", active: true, count: 8 });
    const el = screen.getByText("Моя команда").closest("[data-nav-item]")!;
    expect(el).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("inactive item has no aria-current", () => {
    renderItem({ label: "Календарь", icon: "calendar" });
    const el = screen.getByText("Календарь").closest("[data-nav-item]")!;
    expect(el).not.toHaveAttribute("aria-current");
  });

  it("renders as a Link when href is provided and not disabled", () => {
    renderItem({ label: "Календарь", icon: "calendar", href: "/calendar", active: true });
    const el = screen.getByText("Календарь").closest("[data-nav-item]")!;
    expect(el.tagName).toBe("A");
    expect(el).toHaveAttribute("href", "/calendar");
    expect(el).toHaveAttribute("aria-current", "page");
  });

  it("renders as a div when disabled even with href", () => {
    renderItem({ label: "Грейды", icon: "layers", href: "/grades", disabled: true });
    const el = screen.getByText("Грейды").closest("[data-nav-item]")!;
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveAttribute("aria-disabled", "true");
  });
});
