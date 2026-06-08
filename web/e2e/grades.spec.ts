import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

test("navigate to grades and open a matrix cell", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Грейды" }).click();
  await expect(page).toHaveURL(/\/grades$/);
  await expect(page.getByRole("heading", { name: "Грейды" })).toBeVisible();
  // discipline tabs + matrix grid (default tab = Матрица).
  await expect(page.getByRole("button", { name: "Backend" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Серверный стек")).toBeVisible();
  // click a matrix cell → detail modal.
  const cellByText = page.getByText("Знает синтаксис языка", { exact: false }).first();
  const hasCellText = await cellByText.isVisible().catch(() => false);
  if (hasCellText) {
    await cellByText.click();
  } else {
    // Fallback: click first table button regardless of text.
    await page.locator("table button").first().click();
  }
  await expect(page.getByText(/Что должен демонстрировать/)).toBeVisible({ timeout: 10_000 });
});

test("switch to Уровни and Вилки tabs", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Грейды" }).click();
  await expect(page.getByRole("heading", { name: "Грейды" })).toBeVisible();
  await page.getByRole("button", { name: "Уровни" }).click();
  await expect(page.getByText("Trainee")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Вилки" }).click();
  await expect(page.getByText(/Точные цифры/)).toBeVisible({ timeout: 10_000 });
});
