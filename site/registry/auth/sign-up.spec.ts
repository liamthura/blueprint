import { expect, test } from "@playwright/test";

// Requires a running database: pnpm db:up && pnpm db:migrate
test("a new account can be created and lands signed in", async ({ page }) => {
  const email = `test-${Date.now()}@example.test`;

  await page.goto("/sign-up");
  await page.getByPlaceholder("Name").fill("Test Person");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/");
});
