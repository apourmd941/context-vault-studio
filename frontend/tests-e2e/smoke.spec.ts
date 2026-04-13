import { expect, test } from "@playwright/test";

test("guided demo and v2 artifact panel render", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Context Vault Studio")).toBeVisible();
  await expect(page.getByText("Load guided demo")).toBeVisible();
  await expect(page.getByText("V2 studio")).toBeVisible();
  await expect(page.getByRole("button", { name: "Logic profile" })).toBeVisible();
});
