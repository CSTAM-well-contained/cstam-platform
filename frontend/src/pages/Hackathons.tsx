import { Plus, Square } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Hackathon } from "@/api/client";
import { useHackathons, useIsAdmin, useTeams } from "@/api/queries";
import { EndHackathonDialog, NewHackathonDialog } from "@/components/hackathons";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Mono, RelativeTime, StatusDot } from "@/components/status/status";
import { EmptyState, ErrorState, SkeletonRows, Table, Td, Th, Tr } from "@/components/tables/table";
import { Button } from "@/components/ui/button";
import { duration } from "@/lib/format";

export default function Hackathons() {
  const { data, error, isPending } = useHackathons();
  const teams = useTeams().data ?? [];
  const admin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const [ending, setEnding] = useState<Hackathon | null>(null);
  const setNew = (o: boolean) => {
    const next = new URLSearchParams(params);
    if (o) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  };
  const count = (name?: string) => teams.filter((t) => t.hackathon === name).length;
  const create = admin && (
    <Button onClick={() => setNew(true)}>
      <Plus />
      New hackathon
    </Button>
  );

  return (
    <>
      <PageHeader title="Hackathons" description="Each hackathon has a domain and a team lease time.">
        {create}
      </PageHeader>
      {error && !data ? (
        <ErrorState error={error} />
      ) : !isPending && !data?.length ? (
        <EmptyState title="No hackathon yet" hint="Create one to start spinning up teams." action={create} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>State</Th>
              <Th>Domain</Th>
              <Th>Teams</Th>
              <Th>Lease</Th>
              <Th>Created</Th>
              {admin && (
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <SkeletonRows cols={admin ? 7 : 6} />
            ) : (
              data?.map((x) => (
                <Tr key={x.id}>
                  <Td>
                    <Link
                      to={`/hackathons/${encodeURIComponent(x.name ?? "")}`}
                      className="font-medium hover:underline"
                    >
                      {x.name}
                    </Link>
                  </Td>
                  <Td>
                    {x.state === "active" ? (
                      <Badge tone="ok">
                        <StatusDot tone="ok" />
                        active
                      </Badge>
                    ) : (
                      <Badge>ended</Badge>
                    )}
                  </Td>
                  <Td>
                    <Mono copy="domain">{x.domain}</Mono>
                  </Td>
                  <Td className="tabular-nums">{count(x.name)}</Td>
                  <Td>
                    <Mono>{duration(x.lease_ttl_seconds)}</Mono>
                  </Td>
                  <Td>
                    <RelativeTime iso={x.created_at} />
                  </Td>
                  {admin && (
                    <Td className="text-right">
                      {x.state === "active" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-bad"
                          onClick={() => setEnding(x)}
                        >
                          <Square />
                          End
                        </Button>
                      )}
                    </Td>
                  )}
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <NewHackathonDialog open={admin && params.get("new") === "1"} onOpenChange={setNew} />
      <EndHackathonDialog hackathon={ending} onClose={() => setEnding(null)} />
    </>
  );
}
