import { ArrowLeftRight, Star, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, ApiError, call, type Gateway } from "@/api/client";
import { useAction, useEvents, useIsAdmin, useStatus, useTraffic, type TrafficFeed } from "@/api/queries";
import { ConfirmDialog } from "@/components/layout/confirm";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Mono, RelativeTime, StatusDot, type Tone } from "@/components/status/status";
import { Sparkline } from "@/components/status/sparkline";
import { EmptyState, ErrorState } from "@/components/tables/table";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { describe, eventTone } from "@/lib/events";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

const isMaster = (g: Gateway) => !!g.alive && g.vrrp_state === "MASTER";

function vrrpBadge(g: Gateway) {
  if (!g.alive) return <Badge tone="idle">no report</Badge>;
  const map: Record<string, [Tone, string]> = {
    MASTER: ["ok", "MASTER"],
    BACKUP: ["idle", "BACKUP"],
    FAULT: ["bad", "FAULT"],
    STOP: ["bad", "STOPPED"],
  };
  const [tone, text] = map[g.vrrp_state ?? ""] ?? ["warn", "UNKNOWN"];
  return (
    <Badge tone={tone}>
      {tone === "ok" && <Star className="fill-current" aria-hidden />}
      {text}
    </Badge>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</dd>
    </>
  );
}

function GatewayCard({
  g,
  generation,
  traffic,
  admin,
  onFailover,
  onFailback,
}: {
  g: Gateway;
  generation: number;
  traffic: TrafficFeed | undefined;
  admin: boolean;
  onFailover: () => void;
  onFailback: () => void;
}) {
  const master = isMaster(g);
  const name = g.name ?? "";
  const stats = traffic?.gateways[name];
  const samples = traffic?.samples[name] ?? [];
  const cfgBad = g.config_outcome && g.config_outcome !== "applied" && g.config_tried;
  return (
    <Card className={cn("grid gap-4 p-5", master && "border-ok ring-1 ring-ok/40", !g.alive && "opacity-80")}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-base font-semibold">{name}</h2>
        {vrrpBadge(g)}
        {g.force_backup && <Badge tone="warn">forced backup</Badge>}
      </div>
      {master ? (
        <p className="flex items-center gap-2 font-medium text-ok">
          <Star className="size-4 fill-current" aria-hidden />
          VIP is here: this gateway serves all public traffic
        </p>
      ) : (
        <p className="text-muted">Standby</p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
        <Row k="Routes">
          <Mono>{`gen ${g.acked_generation ?? 0}`}</Mono>
          {g.in_sync ? <Badge tone="ok">in sync</Badge> : <Badge tone="warn">behind {generation}</Badge>}
        </Row>
        <Row k="Config">
          <Mono>{g.config_version || "-"}</Mono>
          {cfgBad && (
            <Badge tone="bad">
              {g.config_tried} {g.config_outcome?.replace("_", " ")}
            </Badge>
          )}
        </Row>
        <Row k="Traffic">
          {stats ? (
            <>
              <span className="tabular-nums">{(stats.rps ?? 0).toFixed(1)} req/s</span>
              <span
                className={cn("tabular-nums", (stats.errors_5xx_10s ?? 0) > 0 ? "text-bad" : "text-muted")}
              >
                · 5xx: {stats.errors_5xx_10s ?? 0} in 10 s
              </span>
              <Sparkline
                values={samples.map((s) => s.rps)}
                label={`${name} requests per second, last minute`}
                className="text-muted"
              />
            </>
          ) : (
            <span className="text-muted">no lines yet</span>
          )}
        </Row>
        <Row k="VRRP since">
          <RelativeTime iso={g.vrrp_since} />
        </Row>
        <Row k="Last report">
          <RelativeTime iso={g.last_seen} />
          {!g.alive && <Badge tone="bad">silent</Badge>}
        </Row>
      </dl>
      {admin && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {g.force_backup ? (
            <Button variant="secondary" size="sm" onClick={onFailback}>
              <Undo2 />
              Failback
            </Button>
          ) : (
            <Button variant={master ? "danger" : "secondary"} size="sm" onClick={onFailover}>
              <ArrowLeftRight />
              {master ? "Planned failover" : "Force to backup"}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function Tile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: Tone }) {
  return (
    <div className="grid gap-1 bg-bg p-4">
      <span className="flex items-center gap-2 text-xs text-muted">
        {tone && <StatusDot tone={tone} />}
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
    </div>
  );
}

function PoolBar({ pool }: { pool: Record<string, number> }) {
  const parts: [string, string, string][] = [
    ["allocated", "bg-ok", "leased"],
    ["quarantine", "bg-warn", "quarantine"],
    ["reserved", "bg-muted", "reserved"],
    ["free", "bg-hover", "free"],
  ];
  const total = parts.reduce((s, [k]) => s + (pool[k] ?? 0), 0) || 1;
  return (
    <div className="grid gap-3">
      <div className="flex h-2 overflow-hidden rounded-full border" aria-hidden>
        {parts.map(([k, c]) => (
          <div key={k} className={c} style={{ width: `${((pool[k] ?? 0) / total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {parts.map(([k, c, label]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm border", c)} aria-hidden />
            <span className="tabular-nums">{pool[k] ?? 0}</span>
            <span className="text-muted">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Pending = { gw: string; master: boolean; force: boolean } | null;

export default function Overview() {
  const status = useStatus();
  const traffic = useTraffic().data;
  const events = useEvents().data?.items ?? [];
  const admin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const [forced, setForced] = useState<string | null>(null);

  // The failover confirmation lives in the URL (?failover=<gw>) so the command menu can open it.
  const asked = params.get("failover");
  const askedGw = status.data?.gateways?.find((g) => g.name === asked);
  const confirm: Pending = forced
    ? { gw: forced, master: false, force: true }
    : admin && asked && askedGw
      ? { gw: asked, master: isMaster(askedGw), force: false }
      : null;
  const ask = (gw: string | null) => {
    const next = new URLSearchParams(params);
    if (gw) next.set("failover", gw);
    else next.delete("failover");
    setParams(next, { replace: true });
  };

  const failover = useAction(
    (v: { gw: string; force: boolean }) =>
      call(
        api.POST("/v1/gateways/{gw}/failover", {
          params: { path: { gw: v.gw }, query: v.force ? { force: true } : {} },
        }),
      ),
    (_, v) => `${v.gw} is stepping down${v.force ? " (forced)" : ""}`,
    (e, v) => {
      // 409: no healthy peer. Offer the forced version behind a second, explicit confirmation.
      if (e instanceof ApiError && e.status === 409 && !v.force) {
        setForced(v.gw);
        return true;
      }
    },
  );
  const failback = useAction(
    (gw: string) => call(api.POST("/v1/gateways/{gw}/failback", { params: { path: { gw } } })),
    (_, gw) => `${gw} may take the VIP again (it stays BACKUP until needed)`,
  );

  if (status.error && !status.data) return <ErrorState error={status.error} />;

  const st = status.data;
  const gws = [...(st?.gateways ?? [])].sort(
    (a, b) => Number(isMaster(b)) - Number(isMaster(a)) || (a.name ?? "").localeCompare(b.name ?? ""),
  );
  const teams = st?.teams ?? {};
  const rps = Object.values(traffic?.gateways ?? {}).reduce((s, g) => s + (g.rps ?? 0), 0);
  const timeline = events
    .filter((e) => e.kind?.startsWith("gateway.") || e.kind?.startsWith("config."))
    .slice(-8)
    .reverse();
  const peer = (gw: string) => gws.find((g) => g.name !== gw)?.name ?? "the peer";

  return (
    <>
      <PageHeader title="Overview" description="Gateway health, the IP pool and team states, live." />

      <section aria-label="Gateways" className="grid gap-4 md:grid-cols-2">
        {!st ? (
          <>
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </>
        ) : gws.length ? (
          gws.map((g) => (
            <GatewayCard
              key={g.name}
              g={g}
              generation={st.generation ?? 0}
              traffic={traffic}
              admin={admin}
              onFailover={() => ask(g.name ?? null)}
              onFailback={() => failback.mutate(g.name ?? "")}
            />
          ))
        ) : (
          <div className="md:col-span-2">
            <EmptyState
              title="No gateway has reported yet"
              hint="Gateways appear here after their first ack to cpd."
            />
          </div>
        )}
      </section>

      <section
        aria-label="Counts"
        className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-6"
      >
        <Tile label="Teams ready" value={teams.ready ?? 0} tone="ok" />
        <Tile label="Provisioning" value={teams.provisioning ?? 0} tone="warn" />
        <Tile label="Failed" value={teams.failed ?? 0} tone="bad" />
        <Tile label="Req/s (10 s)" value={rps.toFixed(1)} />
        <Tile label="Routes generation" value={<span className="font-mono">{st?.generation ?? "-"}</span>} />
        <Tile label="Config version" value={<span className="font-mono">{st?.config_version || "-"}</span>} />
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="IP pool">
            <Link to="/ip-pool" className="text-[13px] text-muted hover:text-fg">
              Open grid →
            </Link>
          </CardHeader>
          <div className="p-4">
            {st ? <PoolBar pool={st.ip_pool ?? {}} /> : <Skeleton className="h-10" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Gateway and config timeline">
            <Link to="/events" className="text-[13px] text-muted hover:text-fg">
              All events →
            </Link>
          </CardHeader>
          {timeline.length ? (
            <ul className="divide-y">
              {timeline.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                  <StatusDot tone={eventTone(e.kind)} />
                  <time dateTime={e.at} className="font-mono text-xs text-muted">
                    {clock(e.at)}
                  </time>
                  <span className="min-w-0 truncate">{describe(e)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-muted">No failover or config change yet.</p>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (o) return;
          setForced(null);
          ask(null);
        }}
        title={
          confirm?.force
            ? `Force the failover of ${confirm.gw}?`
            : `Planned failover of ${confirm?.gw ?? ""}?`
        }
        confirmLabel={confirm?.force ? "Force failover" : "Fail over"}
        pending={failover.isPending}
        onConfirm={() => {
          if (!confirm) return;
          const v = { gw: confirm.gw, force: confirm.force };
          setForced(null);
          ask(null);
          failover.mutate(v);
        }}
      >
        {!confirm
          ? null
          : confirm.force
            ? `cpd refused: no other gateway is alive, in sync and out of FAULT. Forcing it may leave nobody holding the VIP, and public traffic to every team stops until a gateway takes it back.`
            : confirm.master
              ? `All public traffic moves to ${peer(confirm.gw)}. Expected interruption: under 1 second. ${confirm.gw} stays up and can take the VIP again after a failback.`
              : `${confirm.gw} will refuse to take the VIP until you fail it back.`}
      </ConfirmDialog>
    </>
  );
}
