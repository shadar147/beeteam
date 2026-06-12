import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

async function openAnnaGradeTab(page: Page) {
  await login(page);
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Анна Лебедева" }).first().click();
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();
  await page.getByRole("link", { name: "Грейд", exact: true }).click();
  await expect(page).toHaveURL(/tab=grade/);
}

test("draft survives close and reopen", async ({ page }) => {
  await openAnnaGradeTab(page);
  await page.getByRole("button", { name: "Открыть ревью" }).click();
  const dialog = page.getByRole("dialog", { name: "Performance Review" });
  await expect(dialog.getByText("Самооценка сотрудника")).toBeVisible({ timeout: 10_000 });

  // Step 2: bump the first block to IC7.
  await dialog.getByRole("button", { name: "Далее" }).click();
  const firstBlock = dialog.locator('[data-testid^="assess-"]').first();
  await firstBlock.getByRole("button", { name: /IC7/ }).click();
  await expect(dialog.getByText("● Сохранено")).toBeVisible({ timeout: 10_000 });

  // Close, reopen via «Продолжить ревью», check the score survived.
  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await page.getByRole("button", { name: /Продолжить ревью/ }).click();
  await dialog.getByRole("button", { name: "Далее" }).click();
  await expect(
    dialog.locator('[data-testid^="assess-"]').first().getByRole("button", { name: /IC7/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("complete a review through all four steps to pending", async ({ page }) => {
  await openAnnaGradeTab(page);
  await page.getByRole("button", { name: /Продолжить ревью/ }).click();
  const dialog = page.getByRole("dialog", { name: "Performance Review" });

  await dialog.getByRole("button", { name: "Далее" }).click(); // → Оценка
  await expect(dialog.getByText(/Оцените каждый блок по матрице/)).toBeVisible();
  await dialog.getByRole("button", { name: "Далее" }).click(); // → Калибровка
  await expect(dialog.getByText(/Калибровка выравнивает оценки/)).toBeVisible();
  await dialog.getByRole("button", { name: "Далее" }).click(); // → Решение

  await dialog.getByText("Повысить до IC6").click();
  await expect(dialog.getByText("Влияние на вилку")).toBeVisible();
  await dialog.getByLabel("Резюме ревью").fill("e2e: стабильно показывает IC6, повышение обосновано");
  await dialog.getByRole("button", { name: "Завершить ревью" }).click();

  await expect(page.getByText("На согласовании HR")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("История ревью")).toBeVisible();
  await expect(page.getByText("на согласовании", { exact: true })).toBeVisible();
  // Seeded history is also there:
  await expect(page.getByText(/Повышение до IC5/)).toBeVisible();
});
