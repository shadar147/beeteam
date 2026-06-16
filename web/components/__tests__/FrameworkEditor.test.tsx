import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CellEditor } from "../grades/CellEditor";
import { LevelsEditor } from "../grades/LevelsEditor";
import type { DraftLevel } from "../grades/editorTypes";

describe("CellEditor", () => {
  it("applies edited text", () => {
    const onApply = vi.fn();
    render(
      <CellEditor blockName="Стек" levelCode="IC3" levelName="Middle" initial="старый" onApply={onApply} onClose={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText("Текст компетенции"), { target: { value: "новый текст" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(onApply).toHaveBeenCalledWith({ text: "новый текст", required: true });
  });

  it("marks «не требуется» as required=false, text null", () => {
    const onApply = vi.fn();
    render(<CellEditor blockName="Стек" levelCode="IC1" levelName="Junior" initial="x" onApply={onApply} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /не требуется/i }));
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(onApply).toHaveBeenCalledWith({ text: null, required: false });
  });
});

const LEVELS: DraftLevel[] = [
  { ord: 1, code: "IC1", name: "Junior", exp: "0–1", autonomy: "a1", scope: "s1" },
  { ord: 2, code: "IC2", name: "Middle", exp: "1–3", autonomy: "a2", scope: "s2" },
];

describe("LevelsEditor", () => {
  it("edits a level field and fires the setter", () => {
    const onChange = vi.fn();
    render(<LevelsEditor levels={LEVELS} onChange={onChange} />);
    const nameInputs = screen.getAllByLabelText("Название уровня");
    fireEvent.change(nameInputs[0], { target: { value: "Стажёр" } });
    expect(onChange).toHaveBeenCalledWith(1, { name: "Стажёр" });
  });
});
