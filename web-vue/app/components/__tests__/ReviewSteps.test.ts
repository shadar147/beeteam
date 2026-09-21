import { render, screen, fireEvent, within } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import ReviewPrep from "../review/ReviewPrep.vue";
import ReviewAssess from "../review/ReviewAssess.vue";
import ReviewCalibrate from "../review/ReviewCalibrate.vue";
import ReviewDecision from "../review/ReviewDecision.vue";

const LEVELS = [1, 2, 3, 4, 5, 6, 7].map((ord) => ({ ord, code: `IC${ord}`, name: `Уровень ${ord}` }));

const EVIDENCE = [
  {
    id: "e1", meeting_id: null, block_key: "arch", block_name: "Архитектура",
    level_ord: 6, status: "demonstrated", note: "Спроектировала миграцию", created_at: "2026-05-11T10:00:00Z",
  },
];

describe("ReviewPrep", () => {
  it("renders stat cards, self-assessment and evidence summary", () => {
    render(ReviewPrep, {
      props: {
        gradeCode: "IC5", targetCode: "IC6", promo: true, readyMonths: 4,
        selfRows: [{ name: "Архитектура", ord: 6, code: "IC6" }],
        evidence: EVIDENCE as never,
      },
    });
    expect(screen.getByText("IC5 → IC6")).toBeInTheDocument();
    expect(screen.getByText("кандидат на повышение")).toBeInTheDocument();
    expect(screen.getByText("Самооценка сотрудника")).toBeInTheDocument();
    expect(screen.getByText("Спроектировала миграцию")).toBeInTheDocument();
  });

  it("shows the empty state when there is no self-assessment", () => {
    render(ReviewPrep, {
      props: {
        gradeCode: "IC5", targetCode: null, promo: false, readyMonths: 0,
        selfRows: [{ name: "Архитектура", ord: null, code: "" }],
        evidence: [],
      },
    });
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
    render(ReviewAssess, { props: { blocks: BLOCKS, levels: LEVELS, targetOrd: 6 } });
    expect(screen.getByText("расхождение +1")).toBeInTheDocument();
    expect(screen.getByText("совпадает")).toBeInTheDocument();
    expect(screen.getByText("Описание уровня 5")).toBeInTheDocument();
  });

  it("fires onSetLead when a level is clicked", async () => {
    const { emitted } = render(ReviewAssess, { props: { blocks: BLOCKS, levels: LEVELS, targetOrd: 6 } });
    const arch = screen.getByTestId("assess-b1");
    await fireEvent.click(within(arch).getByRole("button", { name: /IC6/ }));
    expect(emitted().setLead).toEqual([["b1", 6]]);
  });
});

describe("ReviewCalibrate", () => {
  it("renders the reviewed member highlighted among peers", () => {
    render(ReviewCalibrate, {
      props: {
        rows: [
          { id: "me", name: "Анна Лебедева", hue: 28, avg: 5.4, me: true, promo: true },
          { id: "p1", name: "Пётр Пиров", hue: 100, avg: 5.0, me: false, promo: false },
        ],
        gradeCode: "IC5", targetCode: "IC6", targetOrd: 6, disciplineLabel: "Frontend",
        levels: LEVELS, avgLead: 5.4,
      },
    });
    expect(screen.getByText("Анна Лебедева (в ревью)")).toBeInTheDocument();
    expect(screen.getByText("Пётр Пиров")).toBeInTheDocument();
    expect(screen.getByText("→ IC6")).toBeInTheDocument();
    expect(screen.getByText("стабилен")).toBeInTheDocument();
  });

  it("shows the no-peers caption when alone", () => {
    render(ReviewCalibrate, {
      props: {
        rows: [{ id: "me", name: "Анна Лебедева", hue: 28, avg: 5.4, me: true, promo: true }],
        gradeCode: "IC5", targetCode: "IC6", targetOrd: 6, disciplineLabel: "Frontend",
        levels: LEVELS, avgLead: 5.4,
      },
    });
    expect(screen.getByText(/Других сотрудников этого грейда в дисциплине пока нет/)).toBeInTheDocument();
  });
});

describe("ReviewDecision", () => {
  const base = {
    gradeOrd: 5, gradeCode: "IC5", nextCode: "IC6",
    summary: "", compa: 0.62, lowBlocks: ["Инфраструктура"],
  };

  it("fires onDecision and shows the salary impact card on promote", async () => {
    const { emitted, rerender } = render(ReviewDecision, { props: { ...base, decision: null } });
    await fireEvent.click(screen.getByText("Повысить до IC6"));
    expect(emitted().decision).toEqual([["promote"]]);
    await rerender({ decision: "promote" });
    expect(screen.getByText("Влияние на вилку")).toBeInTheDocument();
  });

  it("shows the focus plan on pip", () => {
    render(ReviewDecision, { props: { ...base, decision: "pip" } });
    expect(screen.getByText(/Инфраструктура — дотянуть до IC5/)).toBeInTheDocument();
  });

  it("hides promote at IC7", () => {
    render(ReviewDecision, { props: { ...base, gradeOrd: 7, gradeCode: "IC7", nextCode: "IC7", decision: null } });
    expect(screen.queryByText(/Повысить до/)).not.toBeInTheDocument();
  });
});
