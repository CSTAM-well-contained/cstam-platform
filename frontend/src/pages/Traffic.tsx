import { Pause, Play, Eraser } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import type { TrafficLine } from "@/api/client";
import { MAX_TRAFFIC, useTeams, useTraffic } from "@/api/queries";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Mono, StatusDot, type Tone } from "@/components/status/status";
import { Sparkline } from "@/components/status/sparkline";
import { EmptyState, ErrorState, Table, Td, Th, Tr } from "@/components/tables/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

// ponytail: renders the newest 300 of the 1000 kept lines; virtualize the table if more must show.
const SHOWN = 300;

const statusTone = (s = 0): Tone => (s >= 500 ? "bad" : s >= 400 ? "warn" : s >= 300 ? "info" : "ok");

export default function Traffic() {
  const [params, setParams] = useSearchParams();
  const host = params.get("host") ?? "";
  const h = params.get("h") ?? "";
  const { data, error } = useTraffic(host);
  const teams = useTeams().data ?? [];
  const [frozen, setFrozen] = useState<TrafficLine[] | null>(null);
  const [clearedAt, setClearedAt] = useState(0);

  const hosts = teams.filter((t) => !h || t.hackathon === h).map((t) => t.fqdn ?? "");
  const all = (frozen ?? data?.items ?? []).filter((l) => (l.id ?? 0) > clearedAt);
  const lines = all.slice(-SHOWN).reverse();
  const stats = Object.entries(data?.gateways ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Traffic"
        description="Requests seen by the gateways, about once a second. Best effort, kept in memory."
      >
        <Select
          aria-label="Host"
          value={host}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("host", e.target.value);
            else next.delete("host");
            setParams(next, { replace: true });
            setFrozen(null);
          }}
          className="w-auto max-w-72"
        >
          <option value="">All hosts</option>
          {hosts.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
          {host && !hosts.includes(host) && <option value={host}>{host}</option>}
        </Select>
        <Button
          variant="secondary"
          onClick={() => setFrozen(frozen ? null : (data?.items ?? []))}
          aria-pressed={!!frozen}
        >
          {frozen ? <Play /> : <Pause />}
          {frozen ? "Resume" : "Pause"}
        </Button>
        <Button variant="ghost" onClick={() => setClearedAt(data?.lastId ?? 0)}>
          <Eraser />
          Clear
        </Button>
      </PageHeader>

      <section aria-label="Per gateway" className="mb-6 grid gap-4 sm:grid-cols-2">
        {stats.length ? (
          stats.map(([gw, g]) => {
            const s = data?.samples[gw] ?? [];
            return (
              <Card key={gw} className="grid gap-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{gw}</span>
                  <span className="text-xs text-muted">last 10 s · {g.dropped_total ?? 0} lines dropped</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <span className="text-xs text-muted">Requests/s</span>
                    <div className="flex items-end justify-between gap-2">
                      <span className="text-xl font-semibold tabular-nums">{(g.rps ?? 0).toFixed(1)}</span>
                      <Sparkline
                        values={s.map((x) => x.rps)}
                        label={`${gw} requests per second over the last minute`}
                        className="text-fg"
                      />
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs text-muted">5xx</span>
                    <div className="flex items-end justify-between gap-2">
                      <span
                        className={cn(
                          "text-xl font-semibold tabular-nums",
                          (g.errors_5xx_10s ?? 0) > 0 && "text-bad",
                        )}
                      >
                        {g.errors_5xx_10s ?? 0}
                      </span>
                      <Sparkline
                        values={s.map((x) => x.errors)}
                        label={`${gw} 5xx answers over the last minute`}
                        className="text-bad"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="p-4 text-muted sm:col-span-2">No gateway has shipped traffic yet.</Card>
        )}
      </section>

      {frozen && (
        <p className="mb-3 flex items-center gap-2 text-warn" role="status">
          <Pause className="size-4" aria-hidden />
          Paused: new lines are kept but not shown.
        </p>
      )}
      {error && !data ? (
        <ErrorState error={error} />
      ) : !lines.length ? (
        <EmptyState
          title="No requests yet"
          hint={`Send a request to a team subdomain; lines arrive about once a second.${host ? ` Filter: ${host}.` : ""}`}
        />
      ) : (
        <>
          <Table className="max-h-[70vh] overflow-y-auto">
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Gateway</Th>
                <Th>Client</Th>
                <Th>Host</Th>
                <Th>Method</Th>
                <Th>Path</Th>
                <Th>Status</Th>
                <Th className="text-right">Time</Th>
                <Th>Backend</Th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {/* host and path come from the internet: rendered as text only */}
              {lines.map((l) => (
                <Tr key={l.id}>
                  <Td className="whitespace-nowrap text-muted">{clock(l.at)}</Td>
                  <Td>{l.gw}</Td>
                  <Td>{l.client}</Td>
                  <Td className="max-w-56 truncate" title={l.host}>
                    {l.host}
                  </Td>
                  <Td>{l.method}</Td>
                  <Td className="max-w-80 break-all">{l.path}</Td>
                  <Td>
                    <Badge tone={statusTone(l.status)}>
                      <StatusDot tone={statusTone(l.status)} />
                      {l.status}
                    </Badge>
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{l.tt} ms</Td>
                  <Td className="text-muted">{l.be}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted">
            Showing the newest {lines.length} of {all.length} lines (at most {MAX_TRAFFIC} kept). Last id{" "}
            <Mono>{data?.lastId}</Mono>.
          </p>
        </>
      )}
    </>
  );
}
