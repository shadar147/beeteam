import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GradeBands } from "../grades/GradeBands";
import { formatTenge } from "@/lib/format";
import type { GradeLevel } from "@/lib/query/grades";

const shape = (low: number, mid: number, high: number) => ({ low, mid, high });

const MASKED: GradeLevel[] = [
  { ord: 1, code: "IC1", name: "Trainee", exp: "", autonomy: "", scope: "", mgr: false,
    band_shape: shape(0.62, 0.79, 0.98), band_low: null, band_mid: null, band_high: null },
];

const EXACT: GradeLevel[] = [
  { ord: 5, code: "IC5", name: "Senior", exp: "", autonomy: "", scope: "", mgr: true,
    band_shape: shape(0.30, 0.39, 0.49), band_low: 1_400_000, band_mid: 1_800_000, band_high: 2_250_000 },
];

describe("formatTenge", () => {
  it("groups thousands and appends ₸", () => {
    expect(formatTenge(1_300_000)).toMatch(/1\s300\s000\s₸/);
  });
});

describe("GradeBands", () => {
  it("masked: bars + spread, no ₸ numbers", () => {
    render(<GradeBands levels={MASKED} taxRate={null} />);
    expect(screen.getByText("IC1")).toBeInTheDocument();
    expect(screen.getByText(/Точные цифры/)).toBeInTheDocument();
    expect(screen.queryByText(/₸/)).not.toBeInTheDocument();
  });

  it("exact: shows gross and net (net = gross × (1 − rate))", () => {
    render(<GradeBands levels={EXACT} taxRate={0.1} />);
    // formatTenge uses ru-RU locale which may produce \xa0 separators; normalise before building regex
    const toRegex = (n: number) =>
      new RegExp(formatTenge(n).replace("₸", "").trim().replace(/\s/g, "\\s"));
    expect(screen.getByText(toRegex(1_400_000))).toBeInTheDocument();
    // net high = round(2 250 000 × 0.9) = 2 025 000
    expect(screen.getByText(toRegex(2_025_000))).toBeInTheDocument();
    expect(screen.getAllByText(/ИПН 10%/).length).toBeGreaterThan(0);
  });
});
