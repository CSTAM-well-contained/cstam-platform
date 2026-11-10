import { setupServer } from "msw/node";
import { createOpenApiHttp } from "openapi-msw";
import type { paths } from "@/api/schema";
import * as f from "./fixtures";

// http is typed by the contract: a handler for a route or a body that is not in
// openapi.yaml does not compile.
export const http = createOpenApiHttp<paths>({ baseUrl: window.location.origin });

export const ADMIN = "admin-token-0123456789";
export const VIEWER = "viewer-token-0123456789";

const role = (req: Request) => {
  const h = req.headers.get("Authorization");
  return h === `Bearer ${ADMIN}` ? "admin" : h === `Bearer ${VIEWER}` ? "viewer" : undefined;
};

export const handlers = [
  http.get("/v1/whoami", ({ request, response }) => {
    const r = role(request);
    return r ? response(200).json({ role: r }) : response(401).json({ error: "missing or wrong token" });
  }),
  http.get("/v1/status", ({ response }) => response(200).json(f.status)),
  http.get("/v1/hackathons", ({ response }) => response(200).json(f.hackathons)),
  http.get("/v1/teams", ({ response }) => response(200).json(f.teams)),
  http.get("/v1/ipam", ({ response }) => response(200).json(f.ipam)),
  http.get("/v1/events", ({ response }) => response(200).json(f.events)),
  http.get("/v1/config", ({ response }) => response(200).json(f.configs)),
  http.get("/v1/routes", ({ response }) => response(200).json(f.routes)),
  http.get("/v1/traffic", ({ response }) => response(200).json(f.traffic)),
];

export const server = setupServer(...handlers);
