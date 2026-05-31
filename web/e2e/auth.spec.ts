import { test, expect } from "@playwright/test";

test("unauthenticated visit redirects to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
});

test("wrong password shows an inline error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("wrongpass");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page.getByText("Неверная почта или пароль")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("login then logout round-trips through the shell", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();

  // Lands in the (app) shell.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Евгений Глебов")).toBeVisible();
  await expect(page.getByText("Моя команда").first()).toBeVisible();

  // Logout returns to login.
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
