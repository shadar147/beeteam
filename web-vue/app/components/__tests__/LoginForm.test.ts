import { render, screen, fireEvent, waitFor } from "@testing-library/vue";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LoginForm from "../LoginForm.vue";

const push = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  it("toggles password visibility", async () => {
    render(LoginForm);
    const pwd = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(pwd.type).toBe("password");
    await fireEvent.click(screen.getByLabelText("показать пароль"));
    expect(pwd.type).toBe("text");
  });

  it("shows an inline error on failed login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid credentials" }), { status: 401 }),
    );
    render(LoginForm);
    await fireEvent.update(screen.getByLabelText("Корпоративная почта"), "x@y.io");
    await fireEvent.update(screen.getByLabelText("Пароль"), "bad");
    await fireEvent.click(screen.getByRole("button", { name: /Войти/ }));
    await waitFor(() => expect(screen.getByText("Неверная почта или пароль")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects home on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" } }), { status: 200 }),
    );
    render(LoginForm);
    await fireEvent.update(screen.getByLabelText("Корпоративная почта"), "x@y.io");
    await fireEvent.update(screen.getByLabelText("Пароль"), "demo1234");
    await fireEvent.click(screen.getByRole("button", { name: /Войти/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
