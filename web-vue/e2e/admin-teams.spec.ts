import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
}

test("lead has no «Команды» nav and /admin/teams denies access", async ({ page }) => {
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Команды" })).toHaveCount(0);
  await page.goto("/admin/teams");
  await expect(page.getByText("Недостаточно прав")).toBeVisible({ timeout: 10_000 });
});

test("HR creates, renames, and deletes an empty team", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });
  await page.goto("/admin/teams");
  await expect(page.getByRole("heading", { name: "Команды" })).toBeVisible({ timeout: 10_000 });

  // Create
  await page.getByRole("button", { name: /Новая команда/ }).click();
  await page.getByLabel("Название команды").fill("QA e2e");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("QA e2e")).toBeVisible({ timeout: 10_000 });

  // Rename via the row menu
  await page.getByRole("button", { name: "Меню QA e2e" }).click();
  await page.getByRole("button", { name: "Редактировать" }).click();
  await page.getByLabel("Название команды").fill("QA e2e 2");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("QA e2e 2")).toBeVisible({ timeout: 10_000 });

  // Delete (empty → succeeds). Accept the confirm() dialog.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Меню QA e2e 2" }).click();
  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("QA e2e 2")).toHaveCount(0, { timeout: 10_000 });
});

test("HR deleting a team with members is blocked (409) and the team survives", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });
  await page.goto("/admin/teams");
  await expect(page.getByText("Платформенный отдел")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Меню Платформенный отдел" }).click();
  await page.getByRole("button", { name: "Удалить" }).click();

  // 409 banner shown; the seeded team is NOT deleted.
  await expect(page.getByText(/Нельзя удалить команду с сотрудниками/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Платформенный отдел")).toBeVisible();
});
