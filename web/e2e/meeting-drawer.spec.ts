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

test("start a 1-2-1, type notes, complete it", async ({ page }) => {
  await openAnna(page);
  await page.getByRole("button", { name: "Начать 1-2-1" }).click();

  // Drawer opens with template fields.
  await expect(page.getByText("Настроение")).toBeVisible({ timeout: 10_000 });
  // Scope textarea to the drawer <aside> to avoid ambiguity.
  await page.locator("aside textarea").first().fill("Обсудили блокеры по релизу");

  await page.locator("aside").getByRole("button", { name: "Завершить" }).click();
  // Drawer closes; the meeting shows as completed in the feed.
  await expect(page.getByText("Завершена").first()).toBeVisible({ timeout: 10_000 });
});

test("start then cancel removes the planned meeting", async ({ page }) => {
  await openAnna(page);
  await page.getByRole("button", { name: "Начать 1-2-1" }).click();
  await expect(page.locator("aside").getByRole("button", { name: "Завершить" })).toBeVisible({ timeout: 10_000 });
  page.on("dialog", (d) => d.accept()); // confirm("Удалить встречу?") → OK
  await page.locator("aside").getByRole("button", { name: "Отменить" }).click();
  await expect(page.locator("aside").getByRole("button", { name: "Завершить" })).toBeHidden({ timeout: 10_000 });
});
