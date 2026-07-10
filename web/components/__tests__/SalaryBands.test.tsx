import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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

vi.mock("@/lib/query/grades", async (orig) => {
  const actual = await orig<typeof import("@/lib/query/grades")>();
  return {
    ...actual,
    useGradesFramework: () => ({
      isLoading: false, isError: false,
      data: {
        levels: [{ ord: 1, code: "IC1", name: "Junior", exp: "", autonomy: "", scope: "", mgr: false, band_shape: { low: 0.33, mid: 0.66, high: 1 }, band_low: 300000, band_mid: 380000, band_high: 470000 }],
        disciplines: [{ id: "d1", key: "backend", label: "Backend", icon: "fields", description: "", ord: 0, blocks: [] }],
        tax_rate: 0.1,
      },
    }),
    useUpdateLevels: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePutDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateBands: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

import { BandsEditor } from "../grades/BandsEditor";
import type { DraftBand } from "../grades/editorTypes";
import { GradesClient } from "../grades/GradesClient";

const BANDS: DraftBand[] = [
  { ord: 1, code: "IC1", name: "Trainee", band_low: 300000, band_mid: 380000, band_high: 470000 },
];

describe("BandsEditor", () => {
  it("edits a band field and fires the setter", () => {
    const onBand = vi.fn();
    render(<BandsEditor levels={BANDS} taxPct={10} onBand={onBand} onTax={() => {}} />);
    fireEvent.change(screen.getByLabelText("IC1 медиана"), { target: { value: "400000" } });
    expect(onBand).toHaveBeenCalledWith(1, { band_mid: 400000 });
  });

  it("edits the tax rate", () => {
    const onTax = vi.fn();
    render(<BandsEditor levels={BANDS} taxPct={10} onBand={() => {}} onTax={onTax} />);
    fireEvent.change(screen.getByLabelText("Ставка ИПН, %"), { target: { value: "12" } });
    expect(onTax).toHaveBeenCalledWith(12);
  });

  it("shows a live net figure (gross × (1 − rate))", () => {
    render(<BandsEditor levels={BANDS} taxPct={10} onBand={() => {}} onTax={() => {}} />);
    // net mid = round(380000 × 0.9) = 342 000
    expect(screen.getByText(/342\s000/)).toBeInTheDocument();
  });
});

describe("GradesClient bands gating", () => {
  it("shows «Редактировать вилки» only on the Вилки tab when canEditBands", () => {
    render(<GradesClient canEdit={false} canEditBands={true} />);
    expect(screen.queryByRole("button", { name: "Редактировать вилки" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Вилки" }));
    expect(screen.getByRole("button", { name: "Редактировать вилки" })).toBeInTheDocument();
  });

  it("hides «Редактировать вилки» without canEditBands", () => {
    render(<GradesClient canEdit={false} canEditBands={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Вилки" }));
    expect(screen.queryByRole("button", { name: "Редактировать вилки" })).not.toBeInTheDocument();
  });

  it("bands-edit hides the framework «Редактировать» entry (mutual exclusivity)", () => {
    render(<GradesClient canEdit={true} canEditBands={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Вилки" }));
    // both entry points available on the bands tab
    expect(screen.getByRole("button", { name: "Редактировать вилки" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeInTheDocument();
    // enter bands-edit → framework entry disappears, badge shows
    fireEvent.click(screen.getByRole("button", { name: "Редактировать вилки" }));
    expect(screen.getByText("редактирование вилок")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Редактировать" })).not.toBeInTheDocument();
  });
});
