import { useState } from "react";
import { useSearchParams } from "react-router";
import type { Address } from "@/api/client";
import { useIpam } from "@/api/queries";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Mono, RelativeTime, type Tone } from "@/components/status/status";
import { EmptyState, ErrorState, Table, Td, Th, Tr } from "@/components/tables/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Each state has a color AND a shape (outline, solid, dashed, striped) plus the word in the
// legend and the details panel, so the grid reads without color.
const STATES: { key: string; label: string; tone: Tone; cell: string; hint: string }[] = [
  { key: "free", label: "free", tone: "idle", cell: "border-border text-muted", hint: "ready to lease" },
  {
    key: "allocated",
    label: "leased",
    tone: "ok",
    cell: "border-ok bg-ok text-bg font-semibold",
    hint: "held by a team",
  },
  {
    key: "quarantine",
    label: "quarantine",
    tone: "warn",
    cell: "border-dashed border-warn bg-warn-bg text-warn",
    hint: "released, waits until both gateways dropped the route",
  },
  {
    key: "reserved",
    label: "reserved",
    tone: "idle",
    cell: "border-muted text-muted bg-[repeating-linear-gradient(135deg,var(--hover)_0_3px,transparent_3px_6px)]",
    hint: "never leased (gateways, VIP)",
  },
];
const byKey = Object.fromEntries(STATES.map((s) => [s.key, s]));

function Swatch({ cls }: { cls: string }) {
  return <span className={cn("inline-block size-3.5 rounded-sm border", cls)} aria-hidden />;
}

function Details({ a }: { a: Address | undefined }) {
  if (!a) return <p className="text-muted">Hover or focus an address to see who holds it.</p>;
  const s = byKey[a.state ?? ""];
  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
      <div className="flex items-center gap-2">
        <dt className="sr-only">Address</dt>
        <dd>
          <Mono copy="IP">{a.ip}</Mono>
        </dd>
      </div>
      <div className="flex items-center gap-2">
        <dt className="text-muted">State</dt>
        <dd>
          <Badge tone={s?.tone}>{s?.label ?? a.state}</Badge>
        </dd>
      </div>
      {a.team && (
        <div className="flex items-center gap-2">
          <dt className="text-muted">Team</dt>
          <dd>
            {a.team} <span className="text-muted">({a.hackathon})</span>
          </dd>
        </div>
      )}
      {a.released_at && (
        <div className="flex items-center gap-2">
          <dt className="text-muted">Released</dt>
          <dd>
            <RelativeTime iso={a.released_at} />
          </dd>
        </div>
      )}
      <div className="flex items-center gap-2">
        <dt className="text-muted">Changed</dt>
        <dd>
          <RelativeTime iso={a.updated_at} />
        </dd>
      </div>
    </dl>
  );
}

export default function IpPool() {
  const { data, error, isPending } = useIpam();
  const [sel, setSel] = useState<string>();
  const h = useSearchParams()[0].get("h") ?? "";
  const pool = data ?? [];
  const selected = pool.find((a) => a.ip === sel);
  const counts = Object.fromEntries(STATES.map((s) => [s.key, pool.filter((a) => a.state === s.key).length]));
  const used = pool.filter((a) => a.state !== "free" && (!h || a.hackathon === h || !a.hackathon));

  if (error && !data) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader
        title="IP pool"
        description={
          pool.length ? (
            <>
              Team addresses <Mono>{pool[0]?.ip}</Mono> to <Mono>{pool.at(-1)?.ip}</Mono>
            </>
          ) : (
            "Every address of the team pool."
          )
        }
      />
      <Card className="grid gap-5 p-5">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]" aria-label="Legend">
          {STATES.map((s) => (
            <li key={s.key} className="flex items-center gap-2" title={s.hint}>
              <Swatch cls={s.cell} />
              <span>{s.label}</span>
              <span className="text-muted tabular-nums">{counts[s.key]}</span>
            </li>
          ))}
        </ul>
        {isPending ? (
          <Skeleton className="h-48" />
        ) : !pool.length ? (
          <EmptyState title="The pool is empty" hint="cpd has no team addresses configured." />
        ) : (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1"
            role="list"
            aria-label="Addresses"
            onMouseLeave={() => setSel(undefined)}
          >
            {pool.map((a) => {
              const s = byKey[a.state ?? ""];
              const dim = h && a.hackathon && a.hackathon !== h;
              const label = `${a.ip}: ${s?.label ?? a.state}${a.team ? `, ${a.team} (${a.hackathon})` : ""}`;
              return (
                <div
                  key={a.ip}
                  role="listitem"
                  tabIndex={0}
                  aria-label={label}
                  title={label}
                  onMouseEnter={() => setSel(a.ip)}
                  onFocus={() => setSel(a.ip)}
                  className={cn(
                    "grid h-8 place-items-center rounded border font-mono text-[11px] tabular-nums transition-opacity",
                    s?.cell,
                    sel === a.ip && "ring-2 ring-info",
                    dim && "opacity-30",
                  )}
                >
                  {a.ip?.split(".").pop()}
                </div>
              );
            })}
          </div>
        )}
        <div className="min-h-10 border-t pt-4" aria-live="polite">
          <Details a={selected} />
        </div>
      </Card>

      <h2 className="mt-8 mb-3 font-medium">Addresses in use{h && ` (${h})`}</h2>
      {used.length ? (
        <Table>
          <thead>
            <tr>
              <Th>IP</Th>
              <Th>State</Th>
              <Th>Team</Th>
              <Th>Hackathon</Th>
              <Th>Released</Th>
              <Th>Changed</Th>
            </tr>
          </thead>
          <tbody>
            {used.map((a) => (
              <Tr key={a.ip}>
                <Td>
                  <Mono copy="IP">{a.ip}</Mono>
                </Td>
                <Td>
                  <Badge tone={byKey[a.state ?? ""]?.tone}>{byKey[a.state ?? ""]?.label ?? a.state}</Badge>
                </Td>
                <Td>{a.team || <span className="text-muted">-</span>}</Td>
                <Td>{a.hackathon || <span className="text-muted">-</span>}</Td>
                <Td>
                  <RelativeTime iso={a.released_at} />
                </Td>
                <Td>
                  <RelativeTime iso={a.updated_at} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : (
        !isPending && <EmptyState title="Every address is free" />
      )}
    </>
  );
}
