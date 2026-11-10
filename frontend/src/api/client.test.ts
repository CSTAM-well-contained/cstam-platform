import { HttpResponse, http as raw } from "msw";
import { auth } from "@/lib/auth";
import { ADMIN, http, server } from "@/test/server";
import { api, ApiError, call, errorText } from "./client";

test("sends the bearer token and returns data", async () => {
  auth.signIn(ADMIN);
  await expect(call(api.GET("/v1/whoami"))).resolves.toEqual({ role: "admin" });
});

test("401 signs out and keeps the reason", async () => {
  auth.signIn("wrong-token-0123456789");
  const err = await call(api.GET("/v1/whoami")).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(401);
  expect(auth.token()).toBe("");
  expect(auth.reason()).toBe("missing or wrong token");
});

test("503 carries Retry-After", async () => {
  auth.signIn(ADMIN);
  server.use(
    http.post("/v1/hackathons/{h}/teams", ({ response }) =>
      response(503).json({ error: "no free team IP" }, { headers: { "Retry-After": "42" } }),
    ),
  );
  const err = (await call(
    api.POST("/v1/hackathons/{h}/teams", { params: { path: { h: "hack1" } }, body: { name: "t" } }),
  ).catch((e: unknown) => e)) as ApiError;
  expect(err.retryAfter).toBe(42);
  expect(errorText(err)).toBe("Pool full, retry in 42 s");
});

test("network failure and proxy 502 mean cpd does not answer", async () => {
  auth.signIn(ADMIN);
  server.use(raw.get("*/v1/status", () => HttpResponse.error()));
  expect(((await call(api.GET("/v1/status")).catch((e: unknown) => e)) as ApiError).status).toBe(0);
  server.use(raw.get("*/v1/status", () => new HttpResponse("<html>bad gateway</html>", { status: 502 })));
  expect(((await call(api.GET("/v1/status")).catch((e: unknown) => e)) as ApiError).status).toBe(0);
});

test("writes with a body are sent as JSON", async () => {
  auth.signIn(ADMIN);
  let type = "";
  server.use(
    http.post("/v1/hackathons", async ({ request, response }) => {
      type = request.headers.get("Content-Type") ?? "";
      return response(201).json({ id: 3, name: "x", domain: "x.t", state: "active" });
    }),
  );
  await call(api.POST("/v1/hackathons", { body: { name: "x", domain: "x.t" } }));
  expect(type).toMatch(/^application\/json/);
});
