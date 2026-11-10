import { expect, test } from "@playwright/test";
import { adminToken, signIn } from "./tokens";

test("planned failover moves the VIP, failback clears it", async ({ page }) => {
  await signIn(page, adminToken());
  const cards = page.getByRole("region", { name: "Gateways" });
  // The MASTER card is always first and says where the VIP is.
  const first = cards.getByRole("heading", { level: 2 }).first();
  await expect(cards.getByText(/VIP is here/)).toBeVisible();
  const master = (await first.textContent())!.trim();

  await page.getByRole("button", { name: "Planned failover" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fail over" }).click();
  await expect(page.getByText(`${master} is stepping down`)).toBeVisible();

  // Within a few seconds the peer is MASTER (first card) and the old one is forced to backup.
  await expect(first).not.toHaveText(master, { timeout: 15_000 });
  await expect(cards.getByText("forced backup")).toBeVisible();

  await page.getByRole("button", { name: "Failback" }).click();
  await expect(page.getByText(`${master} may take the VIP again`)).toBeVisible();
  await expect(cards.getByText("forced backup")).toHaveCount(0, { timeout: 15_000 });
});
