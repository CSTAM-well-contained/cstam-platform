import { expect, test } from "@playwright/test";
import { adminToken, signIn } from "./tokens";

const HACK = "e2e";

test("spin up a team, wait until ready, tear it down", async ({ page, request }) => {
  const auth = { Authorization: `Bearer ${adminToken()}` };
  // The hackathon may already exist (409); an ended one keeps its name, so it must be active.
  await request.post("/v1/hackathons", { headers: auth, data: { name: HACK, domain: `${HACK}.cstam.test` } });
  const hack = await (await request.get(`/v1/hackathons/${HACK}`, { headers: auth })).json();
  test.skip(
    hack.state !== "active",
    `hackathon ${HACK} is ended; run make reset && make up for a fresh database`,
  );

  const team = `t${Date.now().toString(36).slice(-6)}`;
  await signIn(page, adminToken());
  await page.goto(`/teams?h=${HACK}`);
  await page.getByRole("button", { name: "Spin up" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Hackathon").selectOption(HACK);
  await form.getByLabel("Team name").fill(team);
  await form.getByRole("button", { name: "Spin up" }).click();

  // The 202 opens the team drawer, which follows provisioning until ready.
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: team })).toBeVisible();
  await expect(drawer.getByText("Ready: routed on both gateways.")).toBeVisible({ timeout: 45_000 });
  await expect(drawer.getByText(`${team}.${HACK}.cstam.test`)).toBeVisible();

  await drawer.getByRole("button", { name: "Tear down" }).click();
  const confirm = page.getByRole("dialog", { name: `Tear down ${team}?` });
  await expect(confirm.getByRole("button", { name: "Tear down" })).toBeDisabled();
  await confirm.getByRole("textbox").fill(team);
  await confirm.getByRole("button", { name: "Tear down" }).click();
  await expect(page.getByText(`${team}: teardown started`)).toBeVisible();
});
