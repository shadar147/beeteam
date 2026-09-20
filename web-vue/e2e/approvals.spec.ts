import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
}

test("HR returns Игорь's review to the lead", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Согласование" })).toBeVisible();

  await page.getByRole("button", { name: /Игорь Петров/ }).click();
  await expect(page.getByText("Готов к повышению")).toBeVisible();
  await page.getByRole("button", { name: "Вернуть лиду" }).first().click();
  await page.getByLabel("Причина возврата").fill("Добавьте свидетельства по infra-блоку");
  await page.getByRole("button", { name: "Вернуть лиду" }).last().click();

  await expect(page.getByRole("button", { name: /Игорь Петров/ })).toHaveCount(0, { timeout: 10_000 });
});

test("lead re-finalizes the returned review", async ({ page }) => {
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Игорь Петров" }).first().click();
  await page.getByRole("link", { name: "Грейд", exact: true }).click();

  await expect(page.getByText("возвращено HR")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Продолжить ревью/ }).click();
  const dialog = page.getByRole("dialog", { name: "Performance Review" });
  await expect(dialog.getByText(/Возвращено HR: Добавьте свидетельства/)).toBeVisible();

  await dialog.getByRole("button", { name: "Далее" }).click();
  await dialog.getByRole("button", { name: "Далее" }).click();
  await dialog.getByRole("button", { name: "Далее" }).click();
  // Decision «promote» persisted through the return — finalize is enabled.
  await dialog.getByRole("button", { name: "Завершить ревью" }).click();
  await expect(page.getByText("На согласовании HR")).toBeVisible({ timeout: 10_000 });
});

test("HR approves and Игорь becomes IC5", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });

  await page.getByRole("button", { name: /Игорь Петров/ }).click();
  await page.getByRole("button", { name: "Согласовать" }).click();
  await expect(page.getByText(/IC4 → IC5/).last()).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByRole("button", { name: /Игорь Петров/ })).toHaveCount(0, { timeout: 10_000 });

  // Switch to the lead and verify the applied grade.
  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Игорь Петров" }).first().click();
  await page.getByRole("link", { name: "Грейд", exact: true }).click();
  await expect(page.getByText("IC5", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("История ревью")).toBeVisible();
});
