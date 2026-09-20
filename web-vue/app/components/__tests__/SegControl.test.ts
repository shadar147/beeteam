import { render, screen, fireEvent } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import SegControl from "../SegControl.vue";

const opts = [{ value: "all", label: "Все" }, { value: "overdue", label: "Просрочены" }];

describe("SegControl", () => {
  it("marks the active option with aria-pressed", () => {
    render(SegControl, { props: { options: opts, value: "all" } });
    expect(screen.getByText("Все")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Просрочены")).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onChange with the option value", async () => {
    const { emitted } = render(SegControl, { props: { options: opts, value: "all" } });
    await fireEvent.click(screen.getByText("Просрочены"));
    expect(emitted().change).toEqual([["overdue"]]);
  });
});
