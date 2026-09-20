import { test, expect, type Page } from "@playwright/test";

async function openAnnaGoals(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Анна Лебедева" }).first().click();
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();
  await page.getByRole("link", { name: "Цели и развитие" }).click();
  await expect(page).toHaveURL(/tab=goals/);
  await expect(page.getByText("Компетенции")).toBeVisible({ timeout: 10_000 });
}

test("add an OKR via the modal", async ({ page }) => {
  await openAnnaGoals(page);
  // The OKR section's «+ Добавить» is the first one (Цели section).
  await page.getByRole("button", { name: "+ Добавить" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Новая цель" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Цель").fill("Снизить флаки тесты");
  await dialog.getByLabel("Ключевой результат").fill("0 флак-фейлов за спринт");
  await dialog.getByLabel("Срок").fill("2026-09-01");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText("Снизить флаки тесты").first()).toBeVisible({ timeout: 10_000 });
});

test("add then delete a competency", async ({ page }) => {
  await openAnnaGoals(page);
  const name = `Наблюдаемость-${Date.now()}`;
  await page.getByRole("button", { name: "+ Добавить" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Новая компетенция" });
  await dialog.getByLabel("Компетенция").fill(name);
  await dialog.getByLabel("Оценка").fill("7");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

  page.on("dialog", (d) => d.accept());
  await page.getByText(name).locator("xpath=ancestor::div[1]").getByRole("button", { name: "Изменить" }).click();
  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText(name)).toBeHidden({ timeout: 10_000 });
});
