import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { MAX_EVENTS, useEvents } from "@/api/queries";
import { PageHeader } from "@/components/layout/page-header";
import { RelativeTime, StatusDot } from "@/components/status/status";
import { EmptyState, ErrorState } from "@/components/tables/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { describe, eventTone } from "@/lib/events";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Events() {
  const { data, error, isPending } = useEvents();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const needle = q.trim().toLowerCase();
  const items = (data?.items ?? [])
    .filter((e) => !needle || [e.kind, e.team, describe(e)].some((x) => x?.toLowerCase().includes(needle)))
    .slice()
    .reverse();
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader
        title="Events"
        description={`Team states, IP changes, VRRP transitions, failovers and config outcomes (last ${MAX_EVENTS}).`}
      >
        <Input
          type="search"
          aria-label="Filter events"
          placeholder="Filter by kind, team…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64"
        />
      </PageHeader>
      {error && !data ? (
        <ErrorState error={error} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : !items.length ? (
        <EmptyState
          title={needle ? "No event matches" : "No events yet"}
          hint="Events appear as teams, IPs and gateways change."
        />
      ) : (
        <ol className="relative grid border-l pl-6">
          {items.map((e) => {
            const id = e.id ?? 0;
            const expanded = open.has(id);
            return (
              <li key={id} className="relative py-2">
                <span className="absolute top-3.5 -left-[1.95rem] rounded-full bg-bg p-0.5">
                  <StatusDot tone={eventTone(e.kind)} />
                </span>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggle(id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1 text-left hover:bg-hover"
                >
                  <ChevronRight
                    className={cn("size-3.5 text-muted transition-transform", expanded && "rotate-90")}
                    aria-hidden
                  />
                  <time dateTime={e.at} className="font-mono text-xs text-muted" title={e.at}>
                    {clock(e.at)}
                  </time>
                  <span className="font-mono text-xs">{e.kind}</span>
                  <span className="min-w-0 flex-1">{describe(e)}</span>
                  <RelativeTime iso={e.at} className="text-xs text-muted" />
                </button>
                {expanded && (
                  <pre className="mt-1 ml-8 overflow-x-auto rounded-md border bg-subtle p-3 font-mono text-xs">
                    {JSON.stringify({ id: e.id, team: e.team, detail: e.detail }, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
