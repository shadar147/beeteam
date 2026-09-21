import { render, screen, fireEvent } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import FilterPopover from "../FilterPopover.vue";
import { activeFilterCount } from "../FilterPopover";

describe("activeFilterCount", () => {
  it("counts set filters and each tag", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ role: "Backend", tags: ["Mentor", "PIP"] })).toBe(3);
  });
});

describe("FilterPopover", () => {
  it("applies the chosen role and closes", async () => {
    const { emitted } = render(FilterPopover, { props: { value: {} } });
    await fireEvent.change(screen.getByDisplayValue("Все"), { target: { value: "Backend" } });
    await fireEvent.click(screen.getByText("Применить"));
    expect(emitted().apply![0]).toEqual([expect.objectContaining({ role: "Backend" })]);
    expect(emitted().close).toHaveLength(1);
  });

  it("reset applies empty filters", async () => {
    const { emitted } = render(FilterPopover, { props: { value: { role: "Backend" } } });
    await fireEvent.click(screen.getByText("Сбросить"));
    expect(emitted().apply![0]).toEqual([{}]);
  });
});
