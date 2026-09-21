import { test, expect, type Page } from "@playwright/test";

async function openAnnaFiles(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Анна Лебедева" }).first().click();
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();
  await page.getByRole("link", { name: "Файлы" }).click();
  await expect(page).toHaveURL(/tab=files/);
}

test("upload a file then delete it", async ({ page }) => {
  await openAnnaFiles(page);
  const unique = `e2e-${Date.now()}.txt`;
  // The dropzone's hidden <input type=file> accepts setInputFiles.
  await page.locator('input[type="file"]').first().setInputFiles({
    name: unique, mimeType: "text/plain", buffer: Buffer.from("hello e2e"),
  });
  await expect(page.getByText(unique)).toBeVisible({ timeout: 15_000 });

  // Delete it (confirm auto-accept).
  page.on("dialog", (d) => d.accept());
  await page.getByText(unique).locator("xpath=ancestor::div[2]").getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText(unique)).toBeHidden({ timeout: 10_000 });
});
