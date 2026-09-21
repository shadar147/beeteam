import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

async function openMember(page: Page, name: string) {
  await login(page);
  await page.locator('a[href^="/profile/"]').filter({ hasText: name }).click();
  await expect(page).toHaveURL(/\/profile\//);
}

test("graded member shows the grade tab", async ({ page }) => {
  await openMember(page, "Игорь Петров");
  await page.getByRole("link", { name: "Грейд", exact: true }).click();
  await expect(page).toHaveURL(/tab=grade/);
  await expect(page.getByText("Профиль по блокам")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Позиция в полосе")).toBeVisible();
  await expect(page.getByText(/Свидетельства из 1-2-1/)).toBeVisible();
});

test("ungraded member shows the empty state", async ({ page }) => {
  await openMember(page, "Дмитрий Кузнецов");
  await page.getByRole("link", { name: "Грейд", exact: true }).click();
  await expect(page.getByText("Грейд не назначен")).toBeVisible({ timeout: 10_000 });
});
