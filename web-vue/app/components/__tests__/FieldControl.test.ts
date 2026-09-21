import { render, screen, fireEvent } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import FieldControl from "../FieldControl.vue";
import type { FieldDef } from "~/lib/query/meetings";

const moodDef: FieldDef = { id: "f0", ord: 0, kind: "mood", title: "Настроение", required: false, placeholder: null, hint: null, options: [] };
const textDef: FieldDef = { id: "f1", ord: 1, kind: "longtext", title: "Блокеры", required: false, placeholder: "Что мешает?", hint: null, options: [] };

describe("FieldControl", () => {
  it("longtext fires onChange with the typed value", async () => {
    const { emitted } = render(FieldControl, { props: { field: textDef, value: "", moodScore: null } });
    await fireEvent.update(screen.getByPlaceholderText("Что мешает?"), "Флака");
    expect(emitted().change).toEqual([["Флака"]]);
  });

  it("mood picks an emoji + score", async () => {
    const { emitted } = render(FieldControl, { props: { field: moodDef, value: "🙂", moodScore: 7 } });
    await fireEvent.click(screen.getByRole("button", { name: "😄" }));
    expect(emitted().mood).toEqual([["😄", 8]]);
  });

  it("file kind renders a note pointing to the attachments section", () => {
    const fileDef: FieldDef = { ...textDef, id: "f2", kind: "file", title: "Файл" };
    render(FieldControl, { props: { field: fileDef, value: "", moodScore: null } });
    expect(screen.getByText(/Используйте раздел «Вложения» ниже/)).toBeInTheDocument();
  });
});
