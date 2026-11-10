import createClient from "openapi-fetch";
import type { components, paths } from "./schema";
import { auth } from "@/lib/auth";

export type Schemas = components["schemas"];
export type Team = Schemas["Team"];
export type Hackathon = Schemas["Hackathon"];
export type Gateway = Schemas["Gateway"];
export type Status = Schemas["Status"];
export type Address = Schemas["Address"];
export type ConfigVersion = Schemas["ConfigVersion"];
export type Event = Schemas["Event"];
export type TrafficPage = Schemas["TrafficPage"];
export type TrafficLine = NonNullable<TrafficPage["lines"]>[number];
export type Desired = Schemas["Desired"];

// status 0 = cpd (or the proxy in front of it) did not answer.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Same origin only: cpd sends no CORS headers, the dev server or nginx proxies /v1.
// fetch is looked up on each call so test mocks installed later are used.
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  fetch: (req) => globalThis.fetch(req),
});

api.use({
  onRequest({ request }) {
    const t = auth.token();
    if (
      t &&
      !request.headers.has("Authorization") &&
      new URL(request.url).origin === window.location.origin
    ) {
      request.headers.set("Authorization", `Bearer ${t}`);
    }
    return request;
  },
});

type Result<T> = { data?: T; error?: unknown; response: Response };

// call unwraps an openapi-fetch result: the data, or a typed ApiError. A 401 signs out.
export async function call<T>(p: Promise<Result<T>>): Promise<T> {
  let r: Result<T>;
  try {
    r = await p;
  } catch {
    throw new ApiError(0, "cpd does not answer");
  }
  const { response } = r;
  if (response.ok) return r.data as T;
  const status = response.status;
  if (status === 502 || status === 504) throw new ApiError(0, "cpd does not answer");
  const body = r.error as { error?: unknown } | undefined;
  const message = typeof body?.error === "string" && body.error ? body.error : `HTTP ${status}`;
  if (status === 401) auth.signOut(message);
  const ra = Number(response.headers.get("Retry-After"));
  throw new ApiError(status, message, status === 503 && ra > 0 ? ra : undefined);
}

// errorText is what a toast says about a failed action.
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return String(e);
  switch (e.status) {
    case 0:
      return "cpd does not answer";
    case 403:
      return "Read-only token: this needs the admin token";
    case 503:
      return e.retryAfter ? `Pool full, retry in ${e.retryAfter} s` : `Unavailable: ${e.message}`;
    default:
      return e.message;
  }
}
