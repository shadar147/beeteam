import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterPopover, activeFilterCount } from "../FilterPopover";

describe("activeFilterCount", () => {
  it("counts set filters and each tag", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ role: "Backend", tags: ["Mentor", "PIP"] })).toBe(3);
  });
});

describe("FilterPopover", () => {
  it("applies the chosen role and closes", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<FilterPopover value={{}} onApply={onApply} onClose={onClose} />);
    fireEvent.change(screen.getByDisplayValue("Все"), { target: { value: "Backend" } });
    fireEvent.click(screen.getByText("Применить"));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ role: "Backend" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("reset applies empty filters", () => {
    const onApply = vi.fn();
    render(<FilterPopover value={{ role: "Backend" }} onApply={onApply} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Сбросить"));
    expect(onApply).toHaveBeenCalledWith({});
  });
});
