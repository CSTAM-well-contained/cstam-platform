import { expect, test } from "@playwright/test";
import { adminToken, signIn, viewerToken } from "./tokens";

test("a wrong token is refused", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Token").fill("not-the-right-token-at-all");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("This token is refused.")).toBeVisible();
});

test("admin signs in, sees live gateways, signs out", async ({ page }) => {
  await signIn(page, adminToken());
  await expect(page.getByRole("status").filter({ hasText: "live" })).toBeVisible();
  await expect(page.getByText(/VIP is here/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem("cstam.token"))).toBeNull();
});

test("viewer is read-only", async ({ page }) => {
  await signIn(page, viewerToken());
  await expect(page.getByText("read-only")).toBeVisible();
  await expect(page.getByRole("button", { name: /planned failover/i })).toHaveCount(0);
  await page.getByRole("link", { name: "Teams" }).click();
  await expect(page.getByRole("button", { name: /spin up/i })).toHaveCount(0);
});
