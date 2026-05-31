import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Avatar, initialsOf } from "../Avatar";

describe("Avatar", () => {
  it("computes initials from the first two words", () => {
    expect(initialsOf("Евгений Глебов")).toBe("ЕГ");
    expect(initialsOf("Анна")).toBe("А");
    expect(initialsOf("")).toBe("?");
  });

  it("renders initials in the document", () => {
    render(<Avatar name="Евгений Глебов" hue={40} />);
    expect(screen.getByText("ЕГ")).toBeInTheDocument();
  });
});
