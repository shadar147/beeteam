import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FileGlyph } from "../FileGlyph";
import { FileRow } from "../FileRow";
import { humanSize } from "@/lib/files";
import type { FileMeta } from "@/lib/query/profile";

const FILE: FileMeta = {
  id: "f1", name: "Итоги.pdf", mime: "application/pdf", kind: "pdf",
  size_bytes: 184320, meeting_label: "1-2-1 от 25.05.2026", uploaded_by: "Лид",
  created_at: "2026-05-25T09:00:00Z",
};

describe("Files composites", () => {
  it("humanSize formats bytes", () => {
    expect(humanSize(184320)).toBe("180 КБ");
    expect(humanSize(8388608)).toBe("8 МБ");
    expect(humanSize(512)).toBe("512 Б");
  });

  it("FileGlyph shows the kind label", () => {
    render(<FileGlyph kind="pdf" />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("FileRow shows name, meeting link and size", () => {
    render(<FileRow file={FILE} />);
    expect(screen.getByText("Итоги.pdf")).toBeInTheDocument();
    expect(screen.getByText("1-2-1 от 25.05.2026")).toBeInTheDocument();
    expect(screen.getByText("180 КБ")).toBeInTheDocument();
  });
});
