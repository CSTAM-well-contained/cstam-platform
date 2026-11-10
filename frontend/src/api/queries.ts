import { QueryCache, QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, call, errorText, type Event, type TrafficLine, type TrafficPage } from "./client";
import { health } from "@/lib/health";

// cpd counts as down only when it does not answer; a 404 on one team is not an outage.
const isDown = (e: unknown) => e instanceof ApiError && e.status === 0;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onSuccess: () => health.ok(),
    onError: (e) => (isDown(e) ? health.fail() : health.ok()),
  }),
  defaultOptions: {
    // Polling pauses while the tab is hidden and refetches when it is shown again.
    queries: { retry: false, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  },
});

const every = (ms: number) => ({ refetchInterval: ms, refetchIntervalInBackground: false }) as const;

export const useWhoami = () =>
  useQuery({ queryKey: ["whoami"], queryFn: () => call(api.GET("/v1/whoami")), staleTime: Infinity });

// useIsAdmin is false while the role is unknown: write controls appear only for a known admin.
export const useIsAdmin = () => useWhoami().data?.role === "admin";

export const useStatus = () =>
  useQuery({ queryKey: ["status"], queryFn: () => call(api.GET("/v1/status")), ...every(1000) });

export const useHackathons = () =>
  useQuery({ queryKey: ["hackathons"], queryFn: () => call(api.GET("/v1/hackathons")), ...every(5000) });

export const useHackathon = (h: string) =>
  useQuery({
    queryKey: ["hackathons", h],
    queryFn: () => call(api.GET("/v1/hackathons/{h}", { params: { path: { h } } })),
    ...every(5000),
  });

export const useHackathonTeams = (h: string) =>
  useQuery({
    queryKey: ["hackathons", h, "teams"],
    queryFn: () => call(api.GET("/v1/hackathons/{h}/teams", { params: { path: { h } } })),
    ...every(2000),
  });

export const useTeams = () =>
  useQuery({ queryKey: ["teams"], queryFn: () => call(api.GET("/v1/teams")), ...every(1000) });

export const useTeam = (id: number | undefined) =>
  useQuery({
    queryKey: ["team", id],
    queryFn: () => call(api.GET("/v1/teams/{id}", { params: { path: { id: id! } } })),
    enabled: id !== undefined,
    // A deleted team answers 404 for good: stop polling it.
    refetchInterval: (q) =>
      q.state.error instanceof ApiError && q.state.error.status === 404 ? false : 1000,
    refetchIntervalInBackground: false,
  });

export const useIpam = () =>
  useQuery({ queryKey: ["ipam"], queryFn: () => call(api.GET("/v1/ipam")), ...every(2000) });

export const useConfigVersions = () =>
  useQuery({ queryKey: ["config"], queryFn: () => call(api.GET("/v1/config")), ...every(5000) });

export const useRoutes = () =>
  useQuery({ queryKey: ["routes"], queryFn: () => call(api.GET("/v1/routes")), ...every(5000) });

// ---------- incremental feeds (?after=<last id>) ----------

export const MAX_EVENTS = 1000;
export const MAX_TRAFFIC = 1000;
export const MAX_SAMPLES = 60;

type EventFeed = { items: Event[]; lastId: number };

export const useEvents = () => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["events"],
    queryFn: async (): Promise<EventFeed> => {
      const prev = qc.getQueryData<EventFeed>(["events"]);
      const query = prev ? { after: prev.lastId, limit: 500 } : { limit: 200 };
      const page = await call(api.GET("/v1/events", { params: { query } }));
      if (!prev) return { items: page, lastId: page.at(-1)?.id ?? 0 };
      if (!page.length) return prev;
      return { items: prev.items.concat(page).slice(-MAX_EVENTS), lastId: page.at(-1)?.id ?? prev.lastId };
    },
    ...every(2000),
  });
};

export type GatewayStats = NonNullable<TrafficPage["gateways"]>[string];
export type Sample = { rps: number; errors: number };
export type TrafficFeed = {
  items: TrafficLine[];
  lastId: number;
  gateways: Record<string, GatewayStats>;
  // One sample per poll and gateway, for the sparklines (cpd only gives the last 10 s).
  samples: Record<string, Sample[]>;
};

export const useTraffic = (host = "") => {
  const qc = useQueryClient();
  const key = ["traffic", host];
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<TrafficFeed> => {
      const prev = qc.getQueryData<TrafficFeed>(key);
      const page = await call(
        api.GET("/v1/traffic", {
          params: { query: { after: prev?.lastId ?? 0, limit: 500, ...(host ? { host } : {}) } },
        }),
      );
      const lastId = page.last_id ?? 0;
      // A smaller last_id means cpd restarted (traffic is kept in memory): start over.
      const keep = prev && lastId >= prev.lastId ? prev : undefined;
      const gateways = page.gateways ?? {};
      const samples: Record<string, Sample[]> = {};
      for (const [gw, g] of Object.entries(gateways)) {
        samples[gw] = (keep?.samples[gw] ?? [])
          .concat({ rps: g.rps ?? 0, errors: g.errors_5xx_10s ?? 0 })
          .slice(-MAX_SAMPLES);
      }
      const lines = page.lines ?? [];
      return {
        items: lines.length ? (keep?.items ?? []).concat(lines).slice(-MAX_TRAFFIC) : (keep?.items ?? []),
        lastId,
        gateways,
        samples,
      };
    },
    ...every(1000),
  });
};

// ---------- actions ----------

// useAction runs one write, toasts the outcome, and refreshes every query at once.
export function useAction<V, R>(
  fn: (v: V) => Promise<R>,
  success: (r: R, v: V) => string,
  onError?: (e: unknown, v: V) => boolean | void, // return true when handled
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      toast.success(success(r, v));
      void qc.invalidateQueries();
    },
    onError: (e, v) => {
      if (e instanceof ApiError && e.status === 401) return; // signed out, the login page says why
      if (onError?.(e, v)) return;
      toast.error(errorText(e));
    },
  });
}
