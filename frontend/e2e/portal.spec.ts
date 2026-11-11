import { expect, test } from "@playwright/test";
import { adminToken } from "./tokens";

const HACK = "e2e";

test("a team signs in with its token, hides its app, deploys, and shows it again", async ({
  page,
  request,
}) => {
  const auth = { Authorization: `Bearer ${adminToken()}` };
  await request.post("/v1/hackathons", { headers: auth, data: { name: HACK, domain: `${HACK}.localhost` } });
  const hack = await (await request.get(`/v1/hackathons/${HACK}`, { headers: auth })).json();
  test.skip(
    hack.state !== "active",
    `hackathon ${HACK} is ended; run make reset && make up for a fresh database`,
  );

  const name = `p${Date.now().toString(36).slice(-6)}`;
  const created = await (
    await request.post(`/v1/hackathons/${HACK}/teams`, { headers: auth, data: { name, app_port: 8080 } })
  ).json();
  expect(created.token).toMatch(/^team_[0-9a-f]{40}$/);
  const team = { Authorization: `Bearer ${created.token}` };
  await expect
    .poll(async () => (await (await request.get("/v1/team", { headers: team })).json()).state, {
      timeout: 30_000,
    })
    .toBe("ready");

  // The login page sends a team token to its portal.
  await page.goto("/login");
  await page.getByLabel("Token").fill(created.token);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your sandbox" })).toBeVisible();
  await expect(page.getByText(`${name} @ ${HACK}`)).toBeVisible();

  await page.getByRole("button", { name: "Make private" }).click();
  await expect(page.getByText("private: the subdomain answers 404, your app keeps running")).toBeVisible();

  await page.getByRole("button", { name: "default page" }).click();
  await page.getByLabel("Port it listens on").fill("8001");
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(page.getByText("default page on port 8001")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled({ timeout: 30_000 });

  await page.getByRole("button", { name: "Make public" }).click();
  await expect(page.getByText("public: routed on both gateways")).toBeVisible();

  // An admin page with a team token goes back to the portal, never to admin data.
  await page.goto("/teams");
  await expect(page).toHaveURL(/\/my-team$/);

  await request.delete(`/v1/teams/${created.id}`, { headers: auth });
});
