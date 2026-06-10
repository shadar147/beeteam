import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReviewPrep } from "../review/ReviewPrep";
import { ReviewAssess } from "../review/ReviewAssess";

const LEVELS = [1, 2, 3, 4, 5, 6, 7].map((ord) => ({ ord, code: `IC${ord}`, name: `Уровень ${ord}` }));

const EVIDENCE = [
  {
    id: "e1", meeting_id: null, block_key: "arch", block_name: "Архитектура",
    level_ord: 6, status: "demonstrated", note: "Спроектировала миграцию", created_at: "2026-05-11T10:00:00Z",
  },
];

describe("ReviewPrep", () => {
  it("renders stat cards, self-assessment and evidence summary", () => {
    render(
      <ReviewPrep
        gradeCode="IC5" targetCode="IC6" promo readyMonths={4}
        selfRows={[{ name: "Архитектура", ord: 6, code: "IC6" }]}
        evidence={EVIDENCE as never}
      />,
    );
    expect(screen.getByText("IC5 → IC6")).toBeInTheDocument();
    expect(screen.getByText("кандидат на повышение")).toBeInTheDocument();
    expect(screen.getByText("Самооценка сотрудника")).toBeInTheDocument();
    expect(screen.getByText("Спроектировала миграцию")).toBeInTheDocument();
  });

  it("shows the empty state when there is no self-assessment", () => {
    render(
      <ReviewPrep
        gradeCode="IC5" targetCode={null} promo={false} readyMonths={0}
        selfRows={[{ name: "Архитектура", ord: null, code: "" }]}
        evidence={[]}
      />,
    );
    expect(screen.getByText(/Самооценка не получена/)).toBeInTheDocument();
    expect(screen.getByText("подтверждение грейда")).toBeInTheDocument();
  });
});

describe("ReviewAssess", () => {
  const BLOCKS = [
    {
      blockId: "b1", name: "Архитектура", selfOrd: 6, leadOrd: 5, evidenceCount: 2,
      descByLevel: LEVELS.map((l) => `Описание уровня ${l.ord}`),
    },
    {
      blockId: "b2", name: "Стек", selfOrd: 5, leadOrd: 5, evidenceCount: 0,
      descByLevel: LEVELS.map((l) => `Стек уровня ${l.ord}`),
    },
  ];

  it("shows mismatch and match pills and the selected level description", () => {
    render(<ReviewAssess blocks={BLOCKS} levels={LEVELS} targetOrd={6} onSetLead={() => {}} />);
    expect(screen.getByText("расхождение +1")).toBeInTheDocument();
    expect(screen.getByText("совпадает")).toBeInTheDocument();
    expect(screen.getByText("Описание уровня 5")).toBeInTheDocument();
  });

  it("fires onSetLead when a level is clicked", () => {
    const onSetLead = vi.fn();
    render(<ReviewAssess blocks={BLOCKS} levels={LEVELS} targetOrd={6} onSetLead={onSetLead} />);
    const arch = screen.getByTestId("assess-b1");
    fireEvent.click(within(arch).getByRole("button", { name: /IC6/ }));
    expect(onSetLead).toHaveBeenCalledWith("b1", 6);
  });
});
