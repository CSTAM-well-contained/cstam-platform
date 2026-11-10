import { Plus, Search } from "lucide-react";
import { useSearchParams } from "react-router";
import { useIsAdmin, useTeams } from "@/api/queries";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState, EmptyState } from "@/components/tables/table";
import { NoTeams, SpinUpDialog, TeamDrawer, TeamsTable } from "@/components/teams";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

const STATES = ["provisioning", "ready", "failed", "deleting"];

export default function Teams() {
  const { data, error, isPending } = useTeams();
  const admin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const h = params.get("h") ?? "";
  const state = params.get("state") ?? "";
  const q = params.get("q") ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const needle = q.trim().toLowerCase();
  const teams = (data ?? []).filter(
    (t) =>
      (!h || t.hackathon === h) &&
      (!state || t.state === state) &&
      (!needle || [t.name, t.fqdn, t.ip, t.hackathon].some((x) => x?.toLowerCase().includes(needle))),
  );
  const filtered = !!(h || state || needle);
  const spinUp = admin && (
    <Button onClick={() => set("new", "1")}>
      <Plus />
      Spin up
    </Button>
  );

  return (
    <>
      <PageHeader title="Teams" description="Team sandboxes of every hackathon, newest first.">
        {spinUp}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" aria-hidden />
          <Input
            type="search"
            aria-label="Search teams"
            placeholder="Search name, subdomain, IP…"
            value={q}
            onChange={(e) => set("q", e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          aria-label="State"
          value={state}
          onChange={(e) => set("state", e.target.value)}
          className="w-auto"
        >
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      {error && !data ? (
        <ErrorState error={error} />
      ) : (
        <TeamsTable
          teams={teams}
          loading={isPending}
          empty={
            filtered ? (
              <EmptyState
                title="No team matches these filters"
                action={
                  <Button variant="secondary" onClick={() => setParams({})}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <NoTeams action={spinUp} />
            )
          }
        />
      )}
      <SpinUpDialog
        open={admin && params.get("new") === "1"}
        onOpenChange={(o) => set("new", o ? "1" : "")}
        hackathon={h}
      />
      <TeamDrawer />
    </>
  );
}
