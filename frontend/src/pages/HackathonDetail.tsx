import { ChevronLeft, Plus, Square } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError } from "@/api/client";
import { useHackathon, useHackathonTeams, useIsAdmin } from "@/api/queries";
import { EndHackathonDialog } from "@/components/hackathons";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Mono, RelativeTime } from "@/components/status/status";
import { EmptyState, ErrorState } from "@/components/tables/table";
import { NoTeams, SpinUpDialog, TeamDrawer, TeamsTable } from "@/components/teams";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { duration } from "@/lib/format";

export default function HackathonDetail() {
  const h = useParams().h ?? "";
  const hack = useHackathon(h);
  const teams = useHackathonTeams(h);
  const admin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const [ending, setEnding] = useState(false);
  const setNew = (o: boolean) => {
    const next = new URLSearchParams(params);
    if (o) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  };

  const back = (
    <Link
      to="/hackathons"
      className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"
    >
      <ChevronLeft className="size-4" />
      Hackathons
    </Link>
  );
  if (hack.error instanceof ApiError && hack.error.status === 404)
    return (
      <>
        {back}
        <EmptyState title={`No hackathon named ${h}`} hint="It may have a different name." />
      </>
    );
  if (hack.error && !hack.data) return <ErrorState error={hack.error} />;
  const x = hack.data;
  const active = x?.state === "active";

  return (
    <>
      {back}
      <PageHeader title={h} description={x ? <Mono copy="domain">{x.domain}</Mono> : " "}>
        {admin && active && (
          <>
            <Button onClick={() => setNew(true)}>
              <Plus />
              Spin up a team
            </Button>
            <Button variant="danger" onClick={() => setEnding(true)}>
              <Square />
              End hackathon
            </Button>
          </>
        )}
      </PageHeader>
      <Card className="mb-6 grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4">
        {[
          ["State", x ? <Badge tone={active ? "ok" : "idle"}>{x.state}</Badge> : "-"],
          ["Team lease", <Mono key="l">{duration(x?.lease_ttl_seconds)}</Mono>],
          [
            "Teams",
            <span key="t" className="tabular-nums">
              {teams.data?.filter((t) => t.state !== "deleted").length ?? "-"}
            </span>,
          ],
          ["Created", <RelativeTime key="c" iso={x?.created_at} />],
        ].map(([k, v]) => (
          <div key={String(k)} className="grid gap-1 bg-bg p-4">
            <span className="text-xs text-muted">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </Card>
      <TeamsTable
        teams={(teams.data ?? []).filter((t) => t.state !== "deleted")}
        loading={teams.isPending}
        showHackathon={false}
        empty={
          <NoTeams action={admin && active && <Button onClick={() => setNew(true)}>Spin up a team</Button>} />
        }
      />
      <SpinUpDialog open={admin && params.get("new") === "1"} onOpenChange={setNew} hackathon={h} />
      <EndHackathonDialog hackathon={ending ? (x ?? { name: h }) : null} onClose={() => setEnding(false)} />
      <TeamDrawer />
    </>
  );
}
