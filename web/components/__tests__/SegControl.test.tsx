import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SegControl } from "../SegControl";

const opts = [{ value: "all", label: "Все" }, { value: "overdue", label: "Просрочены" }];

describe("SegControl", () => {
  it("marks the active option with aria-pressed", () => {
    render(<SegControl options={opts} value="all" onChange={() => {}} />);
    expect(screen.getByText("Все")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Просрочены")).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onChange with the option value", () => {
    const onChange = vi.fn();
    render(<SegControl options={opts} value="all" onChange={onChange} />);
    fireEvent.click(screen.getByText("Просрочены"));
    expect(onChange).toHaveBeenCalledWith("overdue");
  });
});
