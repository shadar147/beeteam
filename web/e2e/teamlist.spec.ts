import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

test("team list shows stats and members", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Моя команда" })).toBeVisible();
  // These two labels are unique to the stat cards (not duplicated by segment tabs).
  await expect(page.getByText("Среднее настроение")).toBeVisible();
  await expect(page.getByText("Заметок за квартал")).toBeVisible();
  // 8 seeded members → 8 rows linking to profiles.
  await expect(page.locator('a[href^="/profile/"]')).toHaveCount(8, { timeout: 10_000 });
});

test("search narrows the table", async ({ page }) => {
  await login(page);
  await page.getByPlaceholder("Поиск по имени или роли").fill("Анна");
  await expect(page.locator('a[href^="/profile/"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByText("Анна Лебедева")).toBeVisible();
});

test("row navigates to the profile", async ({ page }) => {
  await login(page);
  // Search to pin the row, so the click target is deterministic (Anna).
  await page.getByPlaceholder("Поиск по имени или роли").fill("Анна");
  await page.locator('a[href^="/profile/"]').first().click();
  await expect(page).toHaveURL(/\/profile\//);
  // The placeholder is gone — the real profile header renders the member name as an h1.
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible({ timeout: 10_000 });
});
