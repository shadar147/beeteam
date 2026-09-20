import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

async function openAnna(page: Page) {
  await login(page);
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Анна Лебедева" }).first().click();
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();
}

test("capture a competency in a 1-2-1", async ({ page }) => {
  await openAnna(page);
  await page.getByRole("button", { name: "Начать 1-2-1" }).click();
  const drawer = page.locator("aside");
  await expect(drawer.getByText("Проявленные компетенции")).toBeVisible({ timeout: 10_000 });
  await drawer.getByLabel("Блок").selectOption({ index: 1 });
  await drawer.getByLabel("Заметка").fill("e2e свидетельство");
  await drawer.getByRole("button", { name: "Отметить IC5" }).click();
  await expect(drawer.getByText("e2e свидетельство")).toBeVisible({ timeout: 10_000 });
});

test("profile grade tab shows the evidence timeline", async ({ page }) => {
  await openAnna(page);
  await page.getByRole("link", { name: "Грейд", exact: true }).click();
  await expect(page).toHaveURL(/tab=grade/);
  await expect(page.getByText("Свидетельства из 1-2-1")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Менторский ритм с Тимуром/)).toBeVisible({ timeout: 10_000 });
});
