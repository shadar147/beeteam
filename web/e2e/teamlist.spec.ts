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
  await expect(page.getByText("На этой неделе")).toBeVisible();
  await expect(page.getByText("Среднее настроение")).toBeVisible();
  // 8 seeded members → 8 rows linking to profiles.
  await expect(page.locator('a[href^="/profile/"]')).toHaveCount(8, { timeout: 10_000 });
});

test("search narrows the table", async ({ page }) => {
  await login(page);
  await page.getByPlaceholder("Поиск по имени или роли").fill("Анна");
  await expect(page.locator('a[href^="/profile/"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByText("Анна Лебедева")).toBeVisible();
});

test("row navigates to the profile placeholder", async ({ page }) => {
  await login(page);
  await page.locator('a[href^="/profile/"]').first().click();
  await expect(page).toHaveURL(/\/profile\//);
  await expect(page.getByText("Профиль появится в следующем срезе")).toBeVisible();
});
