import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Modal } from "../Modal";

describe("Modal", () => {
  it("renders title + children", () => {
    render(<Modal title="Новая цель" onClose={() => {}}><p>тело</p></Modal>);
    expect(screen.getByText("Новая цель")).toBeInTheDocument();
    expect(screen.getByText("тело")).toBeInTheDocument();
  });

  it("calls onClose on Escape and on scrim click", () => {
    const onClose = vi.fn();
    render(<Modal title="T" onClose={onClose}><p>x</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("modal-scrim"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
