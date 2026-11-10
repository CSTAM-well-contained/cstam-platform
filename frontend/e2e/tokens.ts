import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

// Tokens of the stack: CSTAM_ADMIN_TOKEN / CSTAM_VIEWER_TOKEN, else the repo's .env (make up writes it).
function token(kind: "admin" | "viewer"): string {
  const name = `CSTAM_${kind.toUpperCase()}_TOKEN`;
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(fileURLToPath(new URL("../../.env", import.meta.url)), "utf8");
    const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim();
  } catch {
    // no .env: fall through
  }
  throw new Error(`no ${kind} token: set ${name} or run make up at the repo root`);
}

export const adminToken = () => token("admin");
export const viewerToken = () => token("viewer");

export async function signIn(page: Page, t: string) {
  await page.goto("/login");
  await page.getByLabel("Token").fill(t);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Overview" }).waitFor();
}
