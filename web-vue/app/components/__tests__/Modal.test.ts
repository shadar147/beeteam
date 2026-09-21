import { render, screen, fireEvent } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import Modal from "../Modal.vue";

describe("Modal", () => {
  it("renders title + children", () => {
    render(Modal, { props: { title: "Новая цель" }, slots: { default: "<p>тело</p>" } });
    expect(screen.getByText("Новая цель")).toBeInTheDocument();
    expect(screen.getByText("тело")).toBeInTheDocument();
  });

  it("calls onClose on Escape and on scrim click", async () => {
    const { emitted } = render(Modal, { props: { title: "T" }, slots: { default: "<p>x</p>" } });
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(emitted().close).toHaveLength(1);
    await fireEvent.click(screen.getByTestId("modal-scrim"));
    expect(emitted().close).toHaveLength(2);
  });
});
