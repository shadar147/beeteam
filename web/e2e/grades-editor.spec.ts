import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
}

test("lead does not see the edit button on /grades", async ({ page }) => {
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.goto("/grades");
  await expect(page.getByText("Карта компетенций по дисциплинам")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Редактировать" })).toHaveCount(0);
});

test("HR creates a discipline and edits its matrix", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });
  await page.goto("/grades");
  await page.getByRole("button", { name: "Редактировать" }).click();
  await expect(page.getByText("режим редактирования")).toBeVisible();

  // New discipline copying Backend's structure.
  await page.getByRole("button", { name: /Новая дисциплина/ }).click();
  const modal = page.getByRole("dialog", { name: "Новая дисциплина" });
  await modal.getByLabel("Название дисциплины").fill("Дизайн e2e");
  await modal.getByRole("button", { name: "Создать" }).click();

  // After create, the client switches to the new discipline in read mode. Re-enter edit.
  await expect(page.getByRole("button", { name: /Дизайн e2e/ })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Редактировать" }).click();
  await expect(page.getByText("режим редактирования")).toBeVisible();

  // Add a block, name it, then save.
  await page.getByRole("button", { name: /Добавить блок/ }).click();
  await page.getByLabel("Имя блока").last().fill("Композиция");
  await page.getByRole("button", { name: "Сохранить" }).click();

  // After save: reload and confirm the block persisted on the new discipline.
  await expect(page.getByText("режим редактирования")).toHaveCount(0, { timeout: 10_000 });
  await page.reload();
  await page.getByRole("button", { name: /Дизайн e2e/ }).click();
  await expect(page.getByText("Композиция")).toBeVisible({ timeout: 10_000 });
});
