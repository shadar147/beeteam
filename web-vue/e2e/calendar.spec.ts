import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

test("navigate to the calendar and switch views", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Календарь" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("heading", { name: "Календарь" })).toBeVisible();
  // Sidebar widgets present (h3 headings in CalendarSidebar).
  await expect(page.getByText("Ближайшие встречи")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Легенда")).toBeVisible();
  // Switch views via SegControl buttons.
  await page.getByRole("button", { name: "Список" }).click();
  await page.getByRole("button", { name: "Неделя" }).click();
  await page.getByRole("button", { name: "Месяц" }).click();
});

test("clicking a meeting opens the drawer", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Календарь" }).click();
  await expect(page.getByRole("heading", { name: "Календарь" })).toBeVisible();
  // Switch to List view — rows are <button> elements each containing a member name.
  await page.getByRole("button", { name: "Список" }).click();
  // Wait for data to load (either rows or the "Встреч нет" message).
  const listArea = page.locator("div.space-y-4, div.rounded-lg.border.border-dashed");
  await expect(listArea.first()).toBeVisible({ timeout: 10_000 });

  const rows = page.locator("button[type='button']").filter({
    hasText: /[А-Я][а-яё]+ [А-Я][а-яё]+/,
  });
  const rowCount = await rows.count();

  if (rowCount > 0) {
    await rows.first().click();
  } else {
    // Fallback: month view chips if list window has no meetings.
    await page.getByRole("button", { name: "Месяц" }).click();
    await expect(page.locator("button[type='button']").filter({ hasText: /[А-Я]\./ }).first()).toBeVisible({ timeout: 10_000 });
    await page.locator("button[type='button']").filter({ hasText: /[А-Я]\./ }).first().click();
  }

  // MeetingDrawer renders a Pill showing «Завершена» or «Запланирована».
  await expect(page.getByText(/Завершена|Запланирована/).first()).toBeVisible({ timeout: 10_000 });
});
