import type {
  ConfigVersion,
  Event,
  Hackathon,
  Status,
  Team,
  TrafficPage,
  Address,
  Desired,
} from "@/api/client";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();

export const hackathons: Hackathon[] = [
  {
    id: 1,
    name: "hack1",
    domain: "hack1.cstam.test",
    state: "active",
    lease_ttl_seconds: 7200,
    created_at: iso(-3600e3),
  },
  {
    id: 2,
    name: "old",
    domain: "old.cstam.test",
    state: "ended",
    lease_ttl_seconds: 3600,
    created_at: iso(-86400e3),
  },
];

export const teams: Team[] = [
  {
    id: 12,
    hackathon: "hack1",
    name: "team5",
    fqdn: "team5.hack1.cstam.test",
    state: "ready",
    ip: "10.20.0.36",
    slot: 5,
    app_port: 80,
    image: "",
    lease_expires_at: iso(3600e3),
    created_at: iso(-600e3),
  },
  {
    id: 13,
    hackathon: "hack1",
    name: "team6",
    fqdn: "team6.hack1.cstam.test",
    state: "failed",
    ip: "10.20.0.37",
    slot: 6,
    app_port: 8000,
    image: "bad:img",
    error: "image not found",
    lease_expires_at: iso(3600e3),
    created_at: iso(-300e3),
  },
];

export const status: Status = {
  generation: 7,
  config_version: "c4",
  ip_pool: { free: 152, allocated: 3, quarantine: 4, reserved: 1 },
  teams: { ready: 1, failed: 1 },
  gateways: [
    {
      name: "gw2",
      acked_generation: 7,
      config_version: "c4",
      vrrp_state: "BACKUP",
      vrrp_since: iso(-60e3),
      last_seen: iso(-1e3),
      alive: true,
      in_sync: true,
      force_backup: false,
      config_tried: "c4",
      config_outcome: "applied",
    },
    {
      name: "gw1",
      acked_generation: 7,
      config_version: "c4",
      vrrp_state: "MASTER",
      vrrp_since: iso(-60e3),
      last_seen: iso(-1e3),
      alive: true,
      in_sync: true,
      force_backup: false,
      config_tried: "c4",
      config_outcome: "applied",
    },
  ],
  alerts: [],
};

export const ipam: Address[] = [
  { ip: "10.20.0.36", state: "allocated", team: "team5", hackathon: "hack1", updated_at: iso(-600e3) },
  { ip: "10.20.0.37", state: "quarantine", released_at: iso(-20e3), updated_at: iso(-20e3) },
  { ip: "10.20.0.38", state: "free", updated_at: iso(-600e3) },
  { ip: "10.20.0.39", state: "reserved", updated_at: iso(-600e3) },
];

export const events: Event[] = [
  { id: 1, at: iso(-600e3), kind: "team.created", team: "team5", detail: { hackathon: "hack1" } },
  { id: 2, at: iso(-599e3), kind: "team.ready", team: "team5", detail: { seconds: 0.52 } },
];

export const configs: ConfigVersion[] = [
  {
    id: 4,
    version: "c4",
    rate_limit: 2000,
    extra: [],
    reason: "raise limit",
    created_at: iso(-120e3),
    current: true,
  },
  {
    id: 3,
    version: "c3",
    rate_limit: 1000,
    extra: ["http-request deny if { path /x }"],
    reason: "",
    created_at: iso(-900e3),
    current: false,
  },
];

export const traffic: TrafficPage = {
  last_id: 2,
  lines: [
    {
      id: 1,
      at: iso(-2e3),
      gw: "gw1",
      client: "1.2.3.4",
      host: "team5.hack1.cstam.test",
      method: "GET",
      path: "/",
      be: "be_slot005",
      status: 200,
      tt: 3,
      bytes: 512,
    },
    {
      id: 2,
      at: iso(-1e3),
      gw: "gw1",
      client: "1.2.3.4",
      host: "<img src=x onerror=alert(1)>",
      method: "GET",
      path: "/<script>alert(1)</script>",
      be: "be_slot005",
      status: 502,
      tt: 9,
      bytes: 0,
    },
  ],
  gateways: { gw1: { requests_10s: 20, rps: 2, errors_5xx_10s: 1, dropped_total: 0 } },
};

export const routes: Desired = {
  generation: 7,
  routes: [{ host: "team5.hack1.cstam.test", slot: 5, addr: "10.20.0.36", port: 80 }],
  force_backup: [],
};
