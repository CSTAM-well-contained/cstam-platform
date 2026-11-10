import { useEffect, useState } from "react";

// Where team pages are published, from /env.json (written by the nginx image at start):
// publicPort = the port of the public entry (the edge / floating IP), mode = local | felcloud.
// Under `npm run dev` there is no /env.json: default to port 80, mode unknown.
export type PublicEnv = { publicPort: string; mode: string };
const fallback: PublicEnv = { publicPort: "80", mode: "" };

let cached: Promise<PublicEnv> | undefined;
export function loadPublicEnv(): Promise<PublicEnv> {
  cached ??= fetch("/env.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : fallback))
    .then((e: Partial<PublicEnv>) => ({ ...fallback, ...e }))
    .catch(() => fallback);
  return cached;
}

export function usePublicEnv(): PublicEnv {
  const [env, setEnv] = useState(fallback);
  useEffect(() => {
    let alive = true;
    void loadPublicEnv().then((e) => alive && setEnv(e));
    return () => {
      alive = false;
    };
  }, []);
  return env;
}

// teamUrl: http://<fqdn>[:port]/ (port omitted when it is 80)
export function teamUrl(fqdn: string, port: string): string {
  return `http://${fqdn}${port && port !== "80" ? `:${port}` : ""}/`;
}
