import { render, screen } from "@testing-library/vue";
import { describe, it, expect } from "vitest";
import Avatar from "../Avatar.vue";
import { initialsOf } from "../Avatar";

describe("Avatar", () => {
  it("computes initials from the first two words", () => {
    expect(initialsOf("Евгений Глебов")).toBe("ЕГ");
    expect(initialsOf("Анна")).toBe("А");
    expect(initialsOf("")).toBe("?");
  });

  it("renders initials in the document", () => {
    render(Avatar, { props: { name: "Евгений Глебов", hue: 40 } });
    expect(screen.getByText("ЕГ")).toBeInTheDocument();
  });
});
