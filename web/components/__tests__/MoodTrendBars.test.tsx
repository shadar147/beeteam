import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MoodTrendBars } from "../MoodTrendBars";

describe("MoodTrendBars", () => {
  it("renders one bar per value with value-scaled height", () => {
    const { container } = render(<MoodTrendBars trend={[5, 8]} />);
    const bars = container.querySelectorAll("[data-bar]");
    expect(bars.length).toBe(2);
    expect((bars[0] as HTMLElement).style.height).toBe("11px"); // 4 + 5*1.4
    expect((bars[1] as HTMLElement).style.height).toBe(`${4 + 8 * 1.4}px`); // 15.2px
  });

  it("colors high values with the brand token", () => {
    const { container } = render(<MoodTrendBars trend={[9]} />);
    const bar = container.querySelector("[data-bar]") as HTMLElement;
    expect(bar.style.background).toContain("--brand");
  });
});
