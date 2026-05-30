import { test, expect } from "@playwright/test";

test("home page reads API health as ok", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "BeeTeam" })).toBeVisible();
  await expect(page.getByTestId("health-status")).toHaveText("ok", { timeout: 10_000 });
});
