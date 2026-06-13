import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ScoresReadonly } from "../approvals/ScoresReadonly";
import { ApprovalDetail } from "../approvals/ApprovalDetail";
import { RejectDialog } from "../approvals/RejectDialog";

const SCORES = [
  { block_id: "b1", block_key: "stack", block_name: "Стек", self_ord: 5, lead_ord: 5 },
  { block_id: "b2", block_key: "arch", block_name: "Архитектура", self_ord: null, lead_ord: 5 },
];

const REVIEW = {
  id: "r1", period: "H1 2026", status: "pending", from_grade_ord: 4, target_ord: 5,
  decision: "promote", to_grade_ord: 5, summary: "Готов к повышению",
  created_at: "2026-06-10T10:00:00Z", finalized_at: "2026-06-11T10:00:00Z",
  hr_comment: "", resolved_at: null, scores: SCORES,
};

const PENDING = {
  review: REVIEW, member_id: "m1", member_name: "Игорь Петров", member_hue: 200,
  team_name: "Платформа", discipline_label: "Backend",
};

describe("ScoresReadonly", () => {
  it("renders rows with mismatch pills; no note when some self exists", () => {
    render(<ScoresReadonly scores={SCORES as never} />);
    expect(screen.getByText("Стек")).toBeInTheDocument();
    expect(screen.getByText("совпадает")).toBeInTheDocument();
    expect(screen.queryByText(/Самооценка не получена/)).not.toBeInTheDocument();
  });

  it("shows the no-self note only when no block has a self-assessment", () => {
    const allNull = SCORES.map((s) => ({ ...s, self_ord: null }));
    render(<ScoresReadonly scores={allNull as never} />);
    expect(screen.getByText(/Самооценка не получена/)).toBeInTheDocument();
  });
});

describe("ApprovalDetail", () => {
  it("renders member header, decision, summary and actions", () => {
    render(
      <ApprovalDetail item={PENDING as never} onApprove={() => {}} onReject={() => {}} busy={false} />,
    );
    expect(screen.getByText("Игорь Петров")).toBeInTheDocument();
    expect(screen.getByText(/Платформа · Backend/)).toBeInTheDocument();
    expect(screen.getByText("Готов к повышению")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Согласовать" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вернуть лиду" })).toBeInTheDocument();
  });

  it("fires onApprove from the confirm dialog with effects listed", () => {
    const onApprove = vi.fn();
    render(<ApprovalDetail item={PENDING as never} onApprove={onApprove} onReject={() => {}} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Согласовать" }));
    expect(screen.getAllByText(/IC4 → IC5/).length).toBeGreaterThan(0);
    expect(screen.getByText(/следующее ревью через 6 мес/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(onApprove).toHaveBeenCalledWith("r1");
  });
});

describe("RejectDialog", () => {
  it("disables submit until a comment is entered", () => {
    const onSubmit = vi.fn();
    render(<RejectDialog onSubmit={onSubmit} onClose={() => {}} busy={false} />);
    const btn = screen.getByRole("button", { name: "Вернуть лиду" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Причина возврата"), { target: { value: "Мало свидетельств" } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledWith("Мало свидетельств");
  });
});
