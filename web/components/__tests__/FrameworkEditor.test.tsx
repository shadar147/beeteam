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

import { MatrixEditor } from "../grades/MatrixEditor";
import { emptyCells, type DraftBlock } from "../grades/editorTypes";

const BLOCKS: DraftBlock[] = [
  { id: "b1", key: "stack", name: "Стек", cells: emptyCells() },
  { id: "b2", key: "core", name: "Ядро", cells: emptyCells() },
];
const COLS = LEVELS; // reuse the 2-level fixture from Task 7's describe scope

describe("MatrixEditor", () => {
  it("renames a block", () => {
    const onRename = vi.fn();
    render(<MatrixEditor blocks={BLOCKS} levels={COLS} onRename={onRename}
      onMove={() => {}} onDelete={() => {}} onAdd={() => {}} onOpenCell={() => {}} />);
    fireEvent.change(screen.getAllByLabelText("Имя блока")[0], { target: { value: "Стек+" } });
    expect(onRename).toHaveBeenCalledWith(0, "Стек+");
  });

  it("adds a block", () => {
    const onAdd = vi.fn();
    render(<MatrixEditor blocks={BLOCKS} levels={COLS} onRename={() => {}}
      onMove={() => {}} onDelete={() => {}} onAdd={onAdd} onOpenCell={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Добавить блок/i }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("moves and deletes blocks; up disabled at the top", () => {
    const onMove = vi.fn();
    const onDelete = vi.fn();
    render(<MatrixEditor blocks={BLOCKS} levels={COLS} onRename={() => {}}
      onMove={onMove} onDelete={onDelete} onAdd={() => {}} onOpenCell={() => {}} />);
    expect(screen.getAllByRole("button", { name: "Блок вверх" })[0]).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Блок вниз" })[0]);
    expect(onMove).toHaveBeenCalledWith(0, 1);
    fireEvent.click(screen.getAllByRole("button", { name: "Удалить блок" })[1]);
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("opens a cell editor on cell click", () => {
    const onOpenCell = vi.fn();
    render(<MatrixEditor blocks={BLOCKS} levels={COLS} onRename={() => {}}
      onMove={() => {}} onDelete={() => {}} onAdd={() => {}} onOpenCell={onOpenCell} />);
    fireEvent.click(screen.getAllByTestId("edit-cell-b1-1")[0]);
    expect(onOpenCell).toHaveBeenCalledWith(0, 1);
  });
});

import { NewDisciplineModal } from "../grades/NewDisciplineModal";

describe("NewDisciplineModal", () => {
  const bases = [{ id: "d1", label: "Backend" }, { id: "d2", label: "Frontend" }];

  it("disables create until a label is entered", () => {
    const onCreate = vi.fn();
    render(<NewDisciplineModal bases={bases} onCreate={onCreate} onClose={() => {}} creating={false} />);
    const btn = screen.getByRole("button", { name: "Создать" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Название дисциплины"), { target: { value: "Дизайн" } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Дизайн", copy_from_discipline_id: "d1" }),
    );
  });
});
