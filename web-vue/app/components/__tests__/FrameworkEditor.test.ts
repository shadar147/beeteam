import { render, screen, fireEvent } from "@testing-library/vue";
import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import CellEditor from "../grades/CellEditor.vue";
import LevelsEditor from "../grades/LevelsEditor.vue";
import MatrixEditor from "../grades/MatrixEditor.vue";
import NewDisciplineModal from "../grades/NewDisciplineModal.vue";
import GradesClient from "../grades/GradesClient.vue";
import { emptyCells, type DraftBlock, type DraftLevel } from "../grades/editorTypes";

vi.mock("~/lib/query/grades", async (orig) => {
  const actual = await orig<typeof import("~/lib/query/grades")>();
  return {
    ...actual,
    useGradesFramework: () => ({
      isLoading: ref(false), isError: ref(false),
      data: ref({
        levels: [{ ord: 1, code: "IC1", name: "Junior", exp: "", autonomy: "", scope: "", mgr: false, band_shape: { low: 0.33, mid: 0.66, high: 1 }, band_low: null, band_mid: null, band_high: null }],
        disciplines: [{ id: "d1", key: "backend", label: "Backend", icon: "fields", description: "", ord: 0, blocks: [] }],
        tax_rate: 0.1,
      }),
    }),
    useUpdateLevels: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
    usePutDiscipline: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
    useCreateDiscipline: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
    useUpdateBands: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  };
});

describe("CellEditor", () => {
  it("applies edited text", async () => {
    const { emitted } = render(CellEditor, {
      props: { blockName: "Стек", levelCode: "IC3", levelName: "Middle", initial: "старый" },
    });
    await fireEvent.update(screen.getByLabelText("Текст компетенции"), "новый текст");
    await fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(emitted().apply).toEqual([[{ text: "новый текст", required: true }]]);
  });

  it("marks «не требуется» as required=false, text null", async () => {
    const { emitted } = render(CellEditor, {
      props: { blockName: "Стек", levelCode: "IC1", levelName: "Junior", initial: "x" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /не требуется/i }));
    await fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(emitted().apply).toEqual([[{ text: null, required: false }]]);
  });
});

const LEVELS: DraftLevel[] = [
  { ord: 1, code: "IC1", name: "Junior", exp: "0–1", autonomy: "a1", scope: "s1" },
  { ord: 2, code: "IC2", name: "Middle", exp: "1–3", autonomy: "a2", scope: "s2" },
];

describe("LevelsEditor", () => {
  it("edits a level field and fires the setter", async () => {
    const { emitted } = render(LevelsEditor, { props: { levels: LEVELS } });
    const nameInputs = screen.getAllByLabelText("Название уровня");
    await fireEvent.update(nameInputs[0]!, "Стажёр");
    expect(emitted().change).toEqual([[1, { name: "Стажёр" }]]);
  });
});

const BLOCKS: DraftBlock[] = [
  { id: "b1", key: "stack", name: "Стек", cells: emptyCells() },
  { id: "b2", key: "core", name: "Ядро", cells: emptyCells() },
];
const COLS = LEVELS; // reuse the 2-level fixture from the LevelsEditor describe scope

describe("MatrixEditor", () => {
  it("renames a block", async () => {
    const { emitted } = render(MatrixEditor, { props: { blocks: BLOCKS, levels: COLS } });
    await fireEvent.update(screen.getAllByLabelText("Имя блока")[0]!, "Стек+");
    expect(emitted().rename).toEqual([[0, "Стек+"]]);
  });

  it("adds a block", async () => {
    const { emitted } = render(MatrixEditor, { props: { blocks: BLOCKS, levels: COLS } });
    await fireEvent.click(screen.getByRole("button", { name: /Добавить блок/i }));
    expect(emitted().add).toHaveLength(1);
  });

  it("moves and deletes blocks; up disabled at the top", async () => {
    const { emitted } = render(MatrixEditor, { props: { blocks: BLOCKS, levels: COLS } });
    expect(screen.getAllByRole("button", { name: "Блок вверх" })[0]).toBeDisabled();
    await fireEvent.click(screen.getAllByRole("button", { name: "Блок вниз" })[0]!);
    expect(emitted().move).toEqual([[0, 1]]);
    await fireEvent.click(screen.getAllByRole("button", { name: "Удалить блок" })[1]!);
    expect(emitted().delete).toEqual([[1]]);
  });

  it("opens a cell editor on cell click", async () => {
    const { emitted } = render(MatrixEditor, { props: { blocks: BLOCKS, levels: COLS } });
    await fireEvent.click(screen.getAllByTestId("edit-cell-b1-1")[0]!);
    expect(emitted().openCell).toEqual([[0, 1]]);
  });
});

describe("NewDisciplineModal", () => {
  const bases = [{ id: "d1", label: "Backend" }, { id: "d2", label: "Frontend" }];

  it("disables create until a label is entered", async () => {
    const { emitted } = render(NewDisciplineModal, { props: { bases, creating: false } });
    const btn = screen.getByRole("button", { name: "Создать" });
    expect(btn).toBeDisabled();
    await fireEvent.update(screen.getByLabelText("Название дисциплины"), "Дизайн");
    expect(btn).toBeEnabled();
    await fireEvent.click(btn);
    expect(emitted().create).toEqual([
      [expect.objectContaining({ label: "Дизайн", copy_from_discipline_id: "d1" })],
    ]);
  });
});

describe("GradesClient edit gating", () => {
  it("shows «Редактировать» only when canEdit", async () => {
    const { rerender } = render(GradesClient, { props: { canEdit: false, canEditBands: false } });
    expect(screen.queryByRole("button", { name: "Редактировать" })).not.toBeInTheDocument();
    await rerender({ canEdit: true, canEditBands: false });
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeInTheDocument();
  });

  it("enters edit mode and hides the Вилки tab", async () => {
    render(GradesClient, { props: { canEdit: true, canEditBands: false } });
    await fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    expect(screen.getByText("режим редактирования")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Вилки" })).not.toBeInTheDocument();
  });
});
