import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoginForm } from "../LoginForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  it("toggles password visibility", () => {
    render(<LoginForm />);
    const pwd = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(pwd.type).toBe("password");
    fireEvent.click(screen.getByLabelText("показать пароль"));
    expect(pwd.type).toBe("text");
  });

  it("shows an inline error on failed login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid credentials" }), { status: 401 }),
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Корпоративная почта"), { target: { value: "x@y.io" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /Войти/ }));
    await waitFor(() => expect(screen.getByText("Неверная почта или пароль")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects home on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" } }), { status: 200 }),
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Корпоративная почта"), { target: { value: "x@y.io" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "demo1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Войти/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
