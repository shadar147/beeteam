import { render, screen } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import EvidenceTimeline from "../grades/EvidenceTimeline.vue";
import GrowChecklist from "../grades/GrowChecklist.vue";

// The CompetencyCaptureView cases of the React EvidenceViews.test.tsx are ported in CompetencyCaptureView.test.ts.

describe("EvidenceTimeline", () => {
  it("renders rows", () => {
    render(EvidenceTimeline, {
      props: {
        evidence: [
          { id: "e1", meeting_id: null, block_key: "arch", block_name: "Архитектура", level_ord: 6, status: "demonstrated", note: "ADR", created_at: "2026-05-11T10:00:00Z" },
        ],
      },
    });
    expect(screen.getByText("ADR")).toBeInTheDocument();
    expect(screen.getByText(/Архитектура · IC6/)).toBeInTheDocument();
  });
  it("renders the empty state", () => {
    render(EvidenceTimeline, { props: { evidence: [] } });
    expect(screen.getByText(/Пока нет зафиксированных свидетельств/)).toBeInTheDocument();
  });
});

describe("GrowChecklist evidence count", () => {
  it("shows the count line when evidenceCount > 0", () => {
    render(GrowChecklist, {
      props: {
        targetCode: "IC5",
        items: [{ blockName: "Базы данных", targetCode: "IC5", text: "оптимизация", evidenceCount: 2 }],
      },
    });
    expect(screen.getByText(/2 свидетельств/)).toBeInTheDocument();
  });
});
