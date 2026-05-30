import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(resolve(__dirname, "../../styles/tokens.css"), "utf8");

describe("design tokens", () => {
  it("defines the amber brand accent in light theme", () => {
    expect(css).toMatch(/--brand:\s*#F5A524/);
  });

  it("defines a dark-theme background override", () => {
    const dark = css.slice(css.indexOf('[data-theme="dark"]'));
    expect(dark).toMatch(/--bg:\s*#14130F/);
  });

  it("defines all three density modes", () => {
    expect(css).toMatch(/\[data-density="compact"\]/);
    expect(css).toMatch(/\[data-density="regular"\]/);
    expect(css).toMatch(/\[data-density="cozy"\]/);
  });
});
