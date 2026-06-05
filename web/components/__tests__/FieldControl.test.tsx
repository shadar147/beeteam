import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FieldControl } from "../FieldControl";
import type { FieldDef } from "@/lib/query/meetings";

const moodDef: FieldDef = { id: "f0", ord: 0, kind: "mood", title: "Настроение", required: false, placeholder: null, hint: null, options: [] };
const textDef: FieldDef = { id: "f1", ord: 1, kind: "longtext", title: "Блокеры", required: false, placeholder: "Что мешает?", hint: null, options: [] };

describe("FieldControl", () => {
  it("longtext fires onChange with the typed value", () => {
    const onChange = vi.fn();
    render(<FieldControl field={textDef} value="" moodScore={null} onChange={onChange} onMood={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Что мешает?"), { target: { value: "Флака" } });
    expect(onChange).toHaveBeenCalledWith("Флака");
  });

  it("mood picks an emoji + score", () => {
    const onMood = vi.fn();
    render(<FieldControl field={moodDef} value="🙂" moodScore={7} onChange={() => {}} onMood={onMood} />);
    fireEvent.click(screen.getByRole("button", { name: "😄" }));
    expect(onMood).toHaveBeenCalledWith("😄", 8);
  });

  it("file kind renders a note pointing to the attachments section", () => {
    const fileDef: FieldDef = { ...textDef, id: "f2", kind: "file", title: "Файл" };
    render(<FieldControl field={fileDef} value="" moodScore={null} onChange={() => {}} onMood={() => {}} />);
    expect(screen.getByText(/Используйте раздел «Вложения» ниже/)).toBeInTheDocument();
  });
});
