import type { Event } from "@/api/client";

// short cuts a long error for one-line summaries; the full detail is shown as JSON on demand.
const short = (s: unknown) => {
  const t = typeof s === "string" ? s : "";
  return t.length > 110 ? t.slice(0, 110) + "…" : t;
};

// describe turns the event kinds cpd emits into one readable line (same wording as the old
// dashboard). Unknown kinds fall back to the kind itself; the detail JSON is always available.
export function describe(e: Event): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const s = (k: string) => String(d[k] ?? "");
  switch (e.kind) {
    case "team.created":
      return `${e.team} created in ${s("hackathon")}`;
    case "team.ready":
      return `${e.team} ready in ${Number(d.seconds ?? 0).toFixed(1)} s`;
    case "team.failed":
      return `${e.team} failed: ${short(d.error)}`;
    case "team.deleting":
      return `${e.team} teardown started`;
    case "team.deleted":
      return `${e.team} deleted`;
    case "ip.allocated":
      return `${s("ip")} leased to ${e.team || "a team"} (slot ${s("slot")})`;
    case "ip.quarantined":
      return `${s("ip")} in quarantine`;
    case "ip.freed":
      return `${s("ip")} free again`;
    case "gateway.vrrp":
      return `${s("gateway")} is now ${s("state") || "unknown"}`;
    case "gateway.failover":
      return `planned failover of ${s("gateway")}${d.force ? " (forced)" : ""}`;
    case "gateway.failback":
      return `failback of ${s("gateway")}`;
    case "config.created":
      return `config ${s("version")} pushed: ${s("reason") || "no reason"}`;
    case "config.rollback":
      return `config ${s("version")}: ${s("reason")}`;
    case "config.applied":
      return `${s("gateway")} serves config ${s("version")}`;
    case "config.rejected":
    case "config.rolled_back":
    case "config.failed":
      return `${s("gateway")} ${e.kind.slice(7).replace("_", " ")} config ${s("version")}, serves ${s("serving")}: ${short(d.error)}`;
    default:
      return [e.kind, e.team].filter(Boolean).join(" ");
  }
}

export function eventTone(kind = ""): "ok" | "warn" | "bad" | "info" | "idle" {
  if (/failed|rejected|rolled_back/.test(kind)) return "bad";
  if (/ready|applied|freed/.test(kind)) return "ok";
  if (/deleting|quarantined|failover/.test(kind)) return "warn";
  if (kind.startsWith("gateway.") || kind.startsWith("config.")) return "info";
  return "idle";
}
