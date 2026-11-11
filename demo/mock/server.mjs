// Stand-in for cpd + gateways: same /v1 contract as backend/api/openapi.yaml, in memory.
// No Postgres, no HAProxy, no team containers: it is what the demo video was filmed on.
// Use it when the real stack (make up) can't run on a machine; the real stack is the reference.
// Serves the real built console (frontend/dist) and team pages by Host header.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DIST = path.resolve(process.argv[2] || "frontend/dist");
const PORT = Number(process.env.PORT || 8080);
const ADMIN = process.env.CSTAM_ADMIN_TOKEN || process.env.ADMIN || "1b4850a40736cb65bccc586e893081bb";
const PUBLIC_PORT = process.env.PUBLIC_PORT || "8090";
const SEED = process.env.SEED !== "0";
const VIEWER = process.env.CSTAM_VIEWER_TOKEN || "61beeacba74860fad2aa59f1e6645e8e";

const now = () => new Date();
const iso = (d = now()) => d.toISOString();
let ids = { h: 0, t: 0, e: 0, tr: 0, c: 0 };
let generation = 41;
const hackathons = [];
const teams = [];
const events = [];
const traffic = [];
const pool = new Map(); // ip -> {state, team, hackathon, released_at, updated_at}
for (let i = 32; i <= 191; i++) pool.set(`10.20.0.${i}`, { state: i === 68 ? "reserved" : "free", updated_at: iso() });
const slots = new Set();
const gw = {
  gw1: { name: "gw1", vrrp_state: "MASTER", vrrp_since: iso(new Date(Date.now() - 3.6e6 * 5)), config_version: "c3", config_tried: "c3", config_outcome: "applied" },
  gw2: { name: "gw2", vrrp_state: "BACKUP", vrrp_since: iso(new Date(Date.now() - 3.6e6 * 5)), config_version: "c3", config_tried: "c3", config_outcome: "applied" },
};
const configs = [
  { id: 1, version: "c1", rate_limit: 2000, extra: [], reason: "initial", created_at: iso(new Date(Date.now() - 864e5)) },
  { id: 2, version: "c2", rate_limit: 2000, extra: ["http-response set-header X-Served-By %[env(GW_NAME)]"], reason: "served-by header", created_at: iso(new Date(Date.now() - 432e5)) },
  { id: 3, version: "c3", rate_limit: 3000, extra: ["http-response set-header X-Served-By %[env(GW_NAME)]"], reason: "raise rate limit for finals", created_at: iso(new Date(Date.now() - 72e5)) },
];
ids.c = 3;

function ev(kind, team, detail = {}) {
  events.push({ id: ++ids.e, at: iso(), kind, team: team || "", detail });
  if (events.length > 3000) events.shift();
}
function allocIp() {
  for (const [ip, a] of pool) if (a.state === "free") return ip;
  return null;
}
function allocSlot() {
  for (let s = 1; s <= 128; s++) if (!slots.has(s)) { slots.add(s); return s; }
  return null;
}
const token = () => "team_" + crypto.randomBytes(20).toString("hex");
const pub = (t) => { const { tok, ...rest } = t; return rest; };

function createHackathon(name, domain, ttl = 7200, ago = 0) {
  const h = { id: ++ids.h, name, domain, state: "active", lease_ttl_seconds: ttl, created_at: iso(new Date(Date.now() - ago)) };
  hackathons.push(h);
  ev("hackathon.created", "", { hackathon: name, domain });
  return h;
}
function createTeam(h, name, { image = "", app_port = 80, instant = false, delay } = {}) {
  const ip = allocIp();
  const slot = allocSlot();
  if (!ip || !slot) return null;
  const t = {
    id: ++ids.t, hackathon: h.name, name, fqdn: `${name}.${h.domain}`, state: "provisioning", ip, slot, app_port, image,
    exposed: true, lease_expires_at: iso(new Date(Date.now() + h.lease_ttl_seconds * 1000)), error: "", created_at: iso(), tok: token(),
  };
  teams.push(t);
  pool.set(ip, { state: "allocated", team: name, hackathon: h.name, updated_at: iso() });
  ev("team.created", name, { hackathon: h.name });
  ev("ip.allocated", name, { ip, slot });
  const d = instant ? 0 : delay ?? 1400 + Math.random() * 2200;
  const ready = () => {
    if (t.state !== "provisioning") return;
    t.state = "ready"; generation++;
    ev("team.ready", name, { seconds: d / 1000 + 0.3 });
  };
  instant ? ready() : setTimeout(ready, d);
  return t;
}
function deploy(t, image, app_port) {
  t.state = "provisioning"; t.image = image; t.app_port = app_port || 80;
  ev("team.deploying", t.name, { image });
  setTimeout(() => { t.state = "ready"; generation++; ev("team.deployed", t.name, { image }); ev("team.ready", t.name, { seconds: 2.4 }); }, 2600);
}
function deleteTeam(t) {
  t.state = "deleting"; ev("team.deleting", t.name);
  setTimeout(() => {
    t.state = "deleted"; generation++; slots.delete(t.slot);
    pool.set(t.ip, { state: "quarantine", team: t.name, hackathon: t.hackathon, released_at: iso(), updated_at: iso() });
    ev("team.deleted", t.name); ev("ip.quarantined", t.name, { ip: t.ip });
    setTimeout(() => { pool.set(t.ip, { state: "free", updated_at: iso() }); ev("ip.freed", "", { ip: t.ip }); }, 10000);
  }, 1200);
}

// ---- seed: an earlier event already ran, a few IPs in use and in quarantine ----
if (SEED) {
const warm = createHackathon("cloudnight", "cloudnight.localhost", 7200, 864e5 * 2);
warm.state = "ended";
const ws = createHackathon("tsyp-workshop", "workshop.localhost", 14400, 3.6e6 * 3);
for (const n of ["byte-me", "kernel-panic", "nullpointers", "packet-pirates", "stack-smashers", "root-access"]) createTeam(ws, n, { instant: true });
teams.find((t) => t.name === "root-access").image = "nginx:alpine";
}
events.splice(0, events.length); // clean log, then recent history
ev("gateway.vrrp", "", { gateway: "gw1", state: "MASTER" });
ev("gateway.vrrp", "", { gateway: "gw2", state: "BACKUP" });
ev("config.created", "", { version: "c3", reason: "raise rate limit for finals" });
ev("config.applied", "", { gateway: "gw2", version: "c3" });
ev("config.applied", "", { gateway: "gw1", version: "c3" });
for (const t of teams) { ev("ip.allocated", t.name, { ip: t.ip, slot: t.slot }); ev("team.ready", t.name, { seconds: 1.8 + Math.random() }); }

// ---- traffic generator ----
const PATHS = ["/", "/", "/", "/api/health", "/assets/app.js", "/assets/style.css", "/api/score", "/favicon.ico", "/login"];
let boost = {}; let kk = 0; // fqdn -> extra rps
setInterval(() => {
  const live = teams.filter((t) => t.state === "ready" && t.exposed).sort(() => Math.random() - 0.5);
  const ts = now();
  const batch = [];
  for (const t of live) {
    const n = Math.round((boost[t.fqdn] ?? 0) / 4 + Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const g = gw.gw1.vrrp_state === "MASTER" ? "gw1" : "gw2";
      const K = ++kk;
      batch.push({
        id: 0, at: iso(ts), ts: ts.toUTCString().slice(5, 25), gw: g,
        client: `${[41, 102, 197, 196][K % 4]}.${(K * 37) % 255}.${(K * 91) % 255}.${(K * 13) % 255}`,
        host: t.fqdn, method: "GET", path: PATHS[(K * 7) % PATHS.length], be: `be_slot${String(t.slot).padStart(3, "0")}`,
        srv: `s${t.slot}`, status: 200, bytes: 600 + ((K * 131) % 9000), tt: 1 + (K % 4), tr: 1 + (K % 3), term: "----",
      });
    }
  }
  batch.sort(() => Math.random() - 0.5).forEach((l) => { l.id = ++ids.tr; traffic.push(l); });
  while (traffic.length > 5000) traffic.shift();
}, 250);

// ---- HTTP ----
const json = (res, code, body, extra = {}) => {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra });
  res.end(JSON.stringify(body));
};
const err = (res, code, msg) => json(res, code, { error: msg });
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); });

function status() {
  const ip_pool = { free: 0, allocated: 0, quarantine: 0, reserved: 0 };
  for (const a of pool.values()) ip_pool[a.state]++;
  const ts = {};
  for (const t of teams) if (t.state !== "deleted") ts[t.state] = (ts[t.state] || 0) + 1;
  const gws = Object.values(gw).map((g) => ({ ...g, acked_generation: generation, last_seen: iso(new Date(Date.now() - 300 - Math.random() * 600)), alive: true, in_sync: true, force_backup: false, config_error: "" }));
  return { generation, ip_pool, teams: ts, gateways: gws, alerts: [], config_version: configs.at(-1).version };
}
function routes() {
  return { generation, routes: teams.filter((t) => t.state === "ready" && t.exposed).map((t) => ({ host: t.fqdn, slot: t.slot, addr: t.ip, port: t.app_port })), force_backup: [], config: { version: configs.at(-1).version, rate_limit: configs.at(-1).rate_limit, extra: configs.at(-1).extra } };
}

const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };
function serveFile(res, file) {
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

const APPS = path.resolve(path.dirname(new URL(import.meta.url).pathname), "apps");
function teamPage(req, res, host) {
  const t = teams.find((x) => x.fqdn === host && x.state !== "deleted");
  const served = gw.gw1.vrrp_state === "MASTER" ? "gw1" : "gw2";
  const hdr = { "X-Served-By": served, "X-Config-Version": configs.at(-1).version };
  if (!t || !t.exposed) { res.writeHead(404, { "Content-Type": "text/html", ...hdr }); return res.end(fs.readFileSync(path.join(APPS, "404.html"), "utf8").replaceAll("{{host}}", host)); }
  if (t.state === "provisioning") { res.writeHead(503, { "Content-Type": "text/html", ...hdr }); return res.end(fs.readFileSync(path.join(APPS, "maint.html"), "utf8").replaceAll("{{host}}", host)); }
  boost[t.fqdn] = (boost[t.fqdn] ?? 0) + 4;
  const which = /orbit|landing/.test(t.image) ? "landing.html" : t.image.startsWith("nginx") ? "nginx.html" : "default.html";
  const url = new URL(req.url, "http://x");
  if (url.pathname !== "/" && which === "landing.html") {
    const f = path.join(APPS, "landing", path.basename(url.pathname));
    if (fs.existsSync(f)) return serveFile(res, f);
  }
  const html = fs.readFileSync(path.join(APPS, which), "utf8")
    .replaceAll("{{team}}", t.name).replaceAll("{{ip}}", t.ip).replaceAll("{{slot}}", String(t.slot))
    .replaceAll("{{host}}", host).replaceAll("{{gw}}", served).replaceAll("{{hack}}", t.hackathon).replaceAll("{{image}}", t.image || "default");
  res.writeHead(200, { "Content-Type": "text/html", ...hdr });
  res.end(html);
}

http.createServer(async (req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  // demo hook (not part of cpd): drive traffic for the Traffic page
  if (p === "/__demo/boost") { for (const t of teams) if (t.state === "ready") boost[t.fqdn] = Number(url.searchParams.get("rps") || 40); return json(res, 200, { ok: true }); }

  if (host.endsWith(".felcloud.tn") || (host.endsWith(".localhost") && host !== "localhost")) return teamPage(req, res, host);

  if (p === "/env.json") return json(res, 200, { publicPort: PUBLIC_PORT, mode: "local" });
  if (p === "/healthz") return json(res, 200, { status: "ok" });

  if (p.startsWith("/v1/")) {
    const auth = (req.headers.authorization || "").replace(/^Bearer\s+/, "");
    const tm = teams.find((t) => t.tok === auth && t.state !== "deleted");
    const role = auth === ADMIN ? "admin" : auth === VIEWER ? "viewer" : tm ? "team" : null;
    if (!role) return err(res, 401, "missing or wrong bearer token");
    const m = req.method;
    const body = m === "POST" ? await readBody(req) : {};
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 60));

    if (p === "/v1/whoami") return json(res, 200, role === "team" ? { role, team: tm.name, hackathon: tm.hackathon } : { role });
    if (p.startsWith("/v1/team/") || p === "/v1/team") {
      if (role !== "team") return err(res, 401, "team token required");
      if (p === "/v1/team") return json(res, 200, pub(tm));
      if (p === "/v1/team/deploy") { deploy(tm, body.image || "", body.app_port); return json(res, 202, pub(tm)); }
      if (p === "/v1/team/expose") { tm.exposed = !!body.exposed; generation++; ev(tm.exposed ? "team.exposed" : "team.hidden", tm.name); return json(res, 200, pub(tm)); }
      if (p === "/v1/team/renew") { tm.lease_expires_at = iso(new Date(Date.now() + 7200e3)); return json(res, 200, { lease_expires_at: tm.lease_expires_at }); }
    }
    if (role === "team") return err(res, 403, "team token: only /v1/team");
    if (m !== "GET" && role === "viewer") return err(res, 403, "read-only token");

    let mm;
    if (p === "/v1/status") return json(res, 200, status());
    if (p === "/v1/hackathons" && m === "GET") return json(res, 200, [...hackathons].reverse());
    if (p === "/v1/hackathons" && m === "POST") {
      if (hackathons.some((h) => h.name === body.name)) return err(res, 409, `hackathon ${body.name} already exists`);
      return json(res, 201, createHackathon(body.name, body.domain, body.lease_ttl_seconds ?? 7200));
    }
    if ((mm = p.match(/^\/v1\/hackathons\/([^/]+)$/))) {
      const h = hackathons.find((x) => x.name === mm[1]);
      if (!h) return err(res, 404, "unknown hackathon");
      if (m === "DELETE") { h.state = "ended"; ev("hackathon.ending", "", { hackathon: h.name }); teams.filter((t) => t.hackathon === h.name && t.state !== "deleted").forEach(deleteTeam); return json(res, 202, h); }
      return json(res, 200, h);
    }
    if ((mm = p.match(/^\/v1\/hackathons\/([^/]+)\/teams$/))) {
      const h = hackathons.find((x) => x.name === mm[1]);
      if (!h) return err(res, 404, "unknown hackathon");
      if (m === "GET") return json(res, 200, teams.filter((t) => t.hackathon === h.name && t.state !== "deleted").map(pub));
      if (h.state !== "active") return err(res, 409, "hackathon not active");
      if (teams.some((t) => t.hackathon === h.name && t.name === body.name && t.state !== "deleted")) return err(res, 409, `team ${body.name} already exists`);
      const t = createTeam(h, body.name, { image: body.image || "", app_port: body.app_port || 80 });
      if (!t) return err(res, 503, "no free team IP");
      return json(res, 202, { ...pub(t), token: t.tok }, { Location: `/v1/teams/${t.id}` });
    }
    if (p === "/v1/teams") return json(res, 200, teams.filter((t) => t.state !== "deleted").reverse().map(pub));
    if ((mm = p.match(/^\/v1\/teams\/(\d+)(\/\w+)?$/))) {
      const t = teams.find((x) => x.id === Number(mm[1]));
      if (!t || t.state === "deleted") return err(res, 404, "unknown team");
      const a = mm[2];
      if (!a && m === "GET") return json(res, 200, pub(t));
      if (!a && m === "DELETE") { deleteTeam(t); return json(res, 202, pub(t)); }
      if (a === "/token") { t.tok = token(); ev("team.token", t.name); return json(res, 200, { token: t.tok }); }
      if (a === "/renew") { t.lease_expires_at = iso(new Date(Date.now() + 7200e3)); return json(res, 200, { lease_expires_at: t.lease_expires_at }); }
      if (a === "/deploy") { deploy(t, body.image || "", body.app_port); return json(res, 202, pub(t)); }
      if (a === "/expose") { t.exposed = !!body.exposed; generation++; return json(res, 200, pub(t)); }
    }
    if (p === "/v1/ipam") return json(res, 200, [...pool].map(([ip, a]) => ({ ip, ...a })));
    if (p === "/v1/routes") return json(res, 200, routes());
    if (p === "/v1/events") {
      const after = Number(url.searchParams.get("after") || 0);
      const limit = Number(url.searchParams.get("limit") || 100);
      return json(res, 200, url.searchParams.has("after") ? events.filter((e) => e.id > after).slice(0, limit) : events.slice(-limit));
    }
    if (p === "/v1/traffic") {
      const after = Number(url.searchParams.get("after") || 0);
      const hostQ = url.searchParams.get("host");
      const lines = traffic.filter((l) => l.id > after && (!hostQ || l.host === hostQ)).slice(-Number(url.searchParams.get("limit") || 200));
      const since = Date.now() - 10000;
      const gws = {};
      for (const g of ["gw1", "gw2"]) {
        const n = traffic.filter((l) => l.gw === g && Date.parse(l.at) > since).length;
        gws[g] = { requests_10s: n, rps: n / 10, errors_5xx_10s: 0, dropped_total: 0 };
      }
      return json(res, 200, { lines, last_id: ids.tr, gateways: gws });
    }
    if (p === "/v1/config" && m === "GET") return json(res, 200, [...configs].reverse().map((c, i) => ({ ...c, current: i === 0 })));
    if ((mm = p.match(/^\/v1\/gateways\/(gw\d)\/(failover|failback)$/))) {
      const other = mm[1] === "gw1" ? "gw2" : "gw1";
      if (mm[2] === "failover") { gw[mm[1]].vrrp_state = "BACKUP"; gw[other].vrrp_state = "MASTER"; gw[other].vrrp_since = iso(); ev("gateway.failover", "", { gateway: mm[1] }); ev("gateway.vrrp", "", { gateway: other, state: "MASTER" }); }
      else ev("gateway.failback", "", { gateway: mm[1] });
      return json(res, 202, status());
    }
    return err(res, 404, "not found");
  }

  // console static files
  const f = path.join(DIST, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (p !== "/" && fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(res, f);
  serveFile(res, path.join(DIST, "index.html"));
}).listen(PORT, () => console.log(`mock cpd + console on :${PORT}`));
