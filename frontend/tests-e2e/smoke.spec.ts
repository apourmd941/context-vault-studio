import { expect, test } from "@playwright/test";

test("v2 shell renders the main lanes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Context Vault Studio")).toBeVisible();
  await expect(page.getByText("Load guided demo")).toBeVisible();
  const laneTabs = page.locator(".window-tabs");
  await expect(laneTabs.getByRole("button", { name: "Structure" })).toBeVisible();
  await expect(laneTabs.getByRole("button", { name: "Logic" })).toBeVisible();
  await expect(laneTabs.getByRole("button", { name: "Explain" })).toBeVisible();
  await expect(laneTabs.getByRole("button", { name: "Build" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
});
