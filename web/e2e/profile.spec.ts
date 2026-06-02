import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

test("opens Anna's profile and walks the three tabs", async ({ page }) => {
  await login(page);

  // Navigate to Anna's profile via her profile link row (avoids ambiguity with
  // any other element that contains her name on the team list).
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Анна Лебедева" }).click();
  await expect(page).toHaveURL(/\/profile\//);
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();

  // History tab (default): the tab link is visible and feed items are loaded.
  // Clicking a feed item selects a meeting in-place (no navigation); verify the
  // item becomes active (data-active=true) after the click.
  await expect(page.getByRole("link", { name: "История 1-2-1" })).toBeVisible();
  const feedItem = page.locator('[data-testid^="feed-item-"]').first();
  await expect(feedItem).toBeVisible({ timeout: 10_000 });
  await feedItem.click();
  await expect(feedItem).toHaveAttribute("data-active", "true", { timeout: 5_000 });

  // Goals tab.
  await page.getByRole("link", { name: "Цели и развитие" }).click();
  await expect(page).toHaveURL(/tab=goals/);
  await expect(page.getByText("Компетенции")).toBeVisible({ timeout: 10_000 });

  // Files tab.
  await page.getByRole("link", { name: "Файлы" }).click();
  await expect(page).toHaveURL(/tab=files/);
  await expect(page.getByText(/Всего/)).toBeVisible({ timeout: 10_000 });
});

test("a foreign / unauthenticated member id is not served member data", async ({ request }) => {
  const res = await request.get("/api/v1/members/00000000-0000-0000-0000-000000000000");
  expect([401, 403, 404]).toContain(res.status());
});
