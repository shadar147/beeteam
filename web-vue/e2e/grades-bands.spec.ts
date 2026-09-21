import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
}

test("lead sees masked bands and no bands-edit button", async ({ page }) => {
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.goto("/grades");
  await page.getByRole("button", { name: "Вилки" }).click();
  await expect(page.getByText("Вид лида: полосы без точных окладов")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Редактировать вилки" })).toHaveCount(0);
  await expect(page.getByText(/₸/)).toHaveCount(0);
});

test("HR edits a band and the tax rate, then restores them", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });
  await page.goto("/grades");
  await page.getByRole("button", { name: "Вилки" }).click();
  await expect(page.getByText("Точные оклады")).toBeVisible({ timeout: 10_000 });

  // Enter edit; change IC1 max (a DISPLAYED field) to a distinctive value + rate to 12%.
  await page.getByRole("button", { name: "Редактировать вилки" }).click();
  await expect(page.getByText("редактирование вилок")).toBeVisible();
  await page.getByLabel("IC1 макс.").fill("471000");
  await page.getByLabel("Ставка ИПН, %").fill("12");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("редактирование вилок")).toHaveCount(0, { timeout: 10_000 });

  // Reload → the change persisted (471 000 in IC1 gross range, ИПН 12%).
  await page.reload();
  await page.getByRole("button", { name: "Вилки" }).click();
  await expect(page.getByText(/471\s000/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/ИПН 12%/).first()).toBeVisible();

  // Restore original IC1 max (470 000) + rate (10%) so other specs' state is unchanged.
  await page.getByRole("button", { name: "Редактировать вилки" }).click();
  await page.getByLabel("IC1 макс.").fill("470000");
  await page.getByLabel("Ставка ИПН, %").fill("10");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("редактирование вилок")).toHaveCount(0, { timeout: 10_000 });
});
