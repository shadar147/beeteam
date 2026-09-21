import { render, screen } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import OkrCard from "../OkrCard.vue";
import DevItemRow from "../DevItemRow.vue";
import CompetencyBar from "../CompetencyBar.vue";
import type { Goal, DevItem, Competency } from "~/lib/query/profile";

const OKR: Goal = {
  id: "g1", quarter: "Q2 2026", title: "Ускорить экраны", key_result: "LCP < 1.5s",
  progress: 60, status: "risk", due: "2026-07-01T00:00:00Z",
};

describe("Goals composites", () => {
  it("OkrCard shows the risk label and progress", () => {
    render(OkrCard, { props: { okr: OKR } });
    expect(screen.getByText("Под риском")).toBeInTheDocument();
    expect(screen.getByText("LCP < 1.5s")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("DevItemRow renders title, kind and note", () => {
    const d: DevItem = { id: "d1", title: "Курс по перфу", kind: "Курс", status: "in_progress", note: "Прогресс 60%" };
    render(DevItemRow, { props: { item: d } });
    expect(screen.getByText("Курс по перфу")).toBeInTheDocument();
    expect(screen.getByText("Прогресс 60%")).toBeInTheDocument();
  });

  it("CompetencyBar sets width from score", () => {
    const c: Competency = { id: "c1", label: "Frontend", score: 8 };
    render(CompetencyBar, { props: { competency: c } });
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByTestId("comp-fill")).toHaveStyle({ width: "80%" });
  });
});
