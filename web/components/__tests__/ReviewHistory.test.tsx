import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReviewHistory } from "../grades/ReviewHistory";
import { GradeHero } from "../grades/GradeHero";

const codeOf = (ord: number) => `IC${ord}`;

const FINAL = {
  id: "r1", period: "H2 2025", status: "final", from_grade_ord: 4, target_ord: 5,
  decision: "promote", to_grade_ord: 5, summary: "Повышение до IC5",
  created_at: "2025-11-01T10:00:00Z", finalized_at: "2025-11-01T10:00:00Z",
  hr_comment: "", resolved_at: "2025-11-03T10:00:00Z", scores: [],
};
const PENDING = { ...FINAL, id: "r2", period: "H1 2026", status: "pending", decision: "hold", from_grade_ord: 5, to_grade_ord: 5 };

describe("ReviewHistory", () => {
  it("renders rows with decisions and the pending pill", () => {
    render(<ReviewHistory reviews={[PENDING, FINAL] as never} codeOf={codeOf} />);
    expect(screen.getByText("История ревью")).toBeInTheDocument();
    expect(screen.getByText("IC4 → IC5")).toBeInTheDocument();
    expect(screen.getByText("повышение")).toBeInTheDocument();
    expect(screen.getByText("на согласовании")).toBeInTheDocument();
  });

  it("renders the empty state", () => {
    render(<ReviewHistory reviews={[]} codeOf={codeOf} />);
    expect(screen.getByText(/Ревью ещё не проводились/)).toBeInTheDocument();
  });

  it("skips drafts", () => {
    render(<ReviewHistory reviews={[{ ...FINAL, status: "draft" }] as never} codeOf={codeOf} />);
    expect(screen.getByText(/Ревью ещё не проводились/)).toBeInTheDocument();
  });

  it("final rows show the resolved date", () => {
    render(<ReviewHistory reviews={[FINAL] as never} codeOf={codeOf} />);
    expect(screen.getByText(/3 нояб\. 2025/)).toBeInTheDocument();
  });
});

const HERO = {
  gradeOrd: 5, gradeCode: "IC5", gradeName: "Senior", disciplineLabel: "Frontend",
  targetOrd: 6, targetCode: "IC6", targetName: "Staff", readyMonths: 4, mgrTrack: false,
  nextReview: null, lastReview: null,
};

describe("GradeHero review action", () => {
  it("offers to open a review when none is active", () => {
    render(<GradeHero {...HERO} activeReview={null} onOpenReview={() => {}} />);
    expect(screen.getByRole("button", { name: "Открыть ревью" })).toBeInTheDocument();
  });
  it("offers to continue a draft", () => {
    render(<GradeHero {...HERO} activeReview="draft" onOpenReview={() => {}} />);
    expect(screen.getByRole("button", { name: /Продолжить ревью/ })).toBeInTheDocument();
    expect(screen.getByText("черновик")).toBeInTheDocument();
  });
  it("shows the pending pill instead of a button", () => {
    render(<GradeHero {...HERO} activeReview="pending" onOpenReview={() => {}} />);
    expect(screen.getByText("На согласовании HR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ревью/i })).not.toBeInTheDocument();
  });

  it("shows the returned pill for a draft returned by HR", () => {
    render(<GradeHero {...HERO} activeReview="draft" returned onOpenReview={() => {}} />);
    expect(screen.getByText("возвращено HR")).toBeInTheDocument();
    expect(screen.queryByText("черновик")).not.toBeInTheDocument();
  });
});
