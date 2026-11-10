import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw, Rocket, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { api, ApiError, call, errorText, type Team } from "@/api/client";
import { useAction, useHackathons, useIsAdmin, useTeam } from "@/api/queries";
import { ConfirmDialog } from "@/components/layout/confirm";
import { Countdown, Mono, RelativeTime, StateLabel } from "@/components/status/status";
import { EmptyState, SkeletonRows, Table, Td, Th, Tr } from "@/components/tables/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { clock, exact } from "@/lib/format";
import { teamSchema, type TeamForm, type TeamValues } from "@/lib/validation";

const live = (t: Team) => t.state === "ready" || t.state === "provisioning";

// useTeamActions: renew and teardown (with its typed confirmation), shared by every team list.
export function useTeamActions() {
  const [doomed, setDoomed] = useState<Team | null>(null);
  const renew = useAction(
    (t: Team) => call(api.POST("/v1/teams/{id}/renew", { params: { path: { id: t.id! } } })),
    (r, t) => `${t.name}: lease extended to ${clock(r.lease_expires_at)}`,
  );
  const teardown = useAction(
    (t: Team) => call(api.DELETE("/v1/teams/{id}", { params: { path: { id: t.id! } } })),
    (_, t) => `${t.name}: teardown started`,
  );
  const dialog = (
    <ConfirmDialog
      open={!!doomed}
      onOpenChange={(o) => !o && setDoomed(null)}
      title={`Tear down ${doomed?.name ?? ""}?`}
      word={doomed?.name}
      confirmLabel="Tear down"
      pending={teardown.isPending}
      onConfirm={() => {
        if (doomed) teardown.mutate(doomed);
        setDoomed(null);
      }}
    >
      {doomed &&
        `The sandbox is deleted, ${doomed.fqdn} stops answering on both gateways, and ${doomed.ip || "its IP"} goes to quarantine until both gateways confirm. This cannot be undone.`}
    </ConfirmDialog>
  );
  return { renew, askTeardown: setDoomed, teardownPending: teardown.isPending, dialog };
}

function TeamButtons({ t, actions }: { t: Team; actions: ReturnType<typeof useTeamActions> }) {
  return (
    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="secondary"
        size="sm"
        disabled={!live(t) || actions.renew.isPending}
        onClick={() => actions.renew.mutate(t)}
        title="Extend the lease by the hackathon's lease time"
      >
        <RefreshCw />
        Renew
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="text-bad"
        disabled={t.state === "deleting" || t.state === "deleted"}
        onClick={() => actions.askTeardown(t)}
      >
        <Trash2 />
        Tear down
      </Button>
    </div>
  );
}

export function TeamsTable({
  teams,
  loading,
  empty,
  showHackathon = true,
}: {
  teams: Team[];
  loading: boolean;
  empty: React.ReactNode;
  showHackathon?: boolean;
}) {
  const admin = useIsAdmin();
  const actions = useTeamActions();
  const [params, setParams] = useSearchParams();
  const open = (id: number | undefined) => {
    const next = new URLSearchParams(params);
    next.set("team", String(id));
    setParams(next);
  };
  if (!loading && !teams.length) return <>{empty}</>;
  const cols = 7 + (showHackathon ? 1 : 0) + (admin ? 1 : 0);
  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Team</Th>
            {showHackathon && <Th>Hackathon</Th>}
            <Th>State</Th>
            <Th>Subdomain</Th>
            <Th>Private IP</Th>
            <Th>Slot</Th>
            <Th>Port</Th>
            <Th>Lease left</Th>
            {admin && (
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            )}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows cols={cols} />
          ) : (
            teams.map((t) => (
              <Tr key={t.id} className="cursor-pointer" onClick={() => open(t.id)}>
                <Td>
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      open(t.id);
                    }}
                  >
                    {t.name}
                  </button>
                </Td>
                {showHackathon && <Td className="text-muted">{t.hackathon}</Td>}
                <Td>
                  <StateLabel state={t.state} />
                  {t.error && (
                    <div className="max-w-56 truncate text-xs text-bad" title={t.error}>
                      {t.error}
                    </div>
                  )}
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <Mono copy="subdomain">{t.fqdn}</Mono>
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <Mono copy="IP">{t.ip}</Mono>
                </Td>
                <Td>
                  <Mono>{t.slot}</Mono>
                </Td>
                <Td>
                  <Mono>{t.app_port}</Mono>
                </Td>
                <Td>
                  {live(t) ? <Countdown iso={t.lease_expires_at} /> : <span className="text-muted">-</span>}
                </Td>
                {admin && (
                  <Td>
                    <TeamButtons t={t} actions={actions} />
                  </Td>
                )}
              </Tr>
            ))
          )}
        </tbody>
      </Table>
      {actions.dialog}
    </>
  );
}

function Detail({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 border-b py-2.5 text-[13px] last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// TeamDrawer follows ?team=<id>, polling the team every second (spin-up progress included).
export function TeamDrawer() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("team");
  const id = raw && /^\d+$/.test(raw) ? Number(raw) : undefined;
  const { data: t, error } = useTeam(id);
  const admin = useIsAdmin();
  const actions = useTeamActions();
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("team");
    setParams(next);
  };
  const gone = error instanceof ApiError && error.status === 404;
  return (
    <Dialog open={id !== undefined} onOpenChange={(o) => !o && close()}>
      <SheetContent title={t?.name ?? `Team ${raw ?? ""}`}>
        {gone ? (
          <p className="text-muted">This team no longer exists (deleted teams are removed from the list).</p>
        ) : error ? (
          <p className="text-bad">{errorText(error)}</p>
        ) : !t ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            {t.state === "provisioning" && (
              <p className="rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-warn" role="status">
                IP and slot are allocated; the sandbox is starting. This page updates by itself.
              </p>
            )}
            {t.state === "failed" && (
              <p className="rounded-md border border-bad/40 bg-bad-bg px-3 py-2 text-bad" role="alert">
                Failed: {t.error || "no reason given"}. cpd cleans failed teams up after 10 minutes.
              </p>
            )}
            {t.state === "ready" && (
              <p className="rounded-md border border-ok/40 bg-ok-bg px-3 py-2 text-ok" role="status">
                Ready: routed on both gateways.
              </p>
            )}
            <dl>
              <Detail k="State">
                <StateLabel state={t.state} />
              </Detail>
              <Detail k="Hackathon">{t.hackathon}</Detail>
              <Detail k="Subdomain">
                <Mono copy="subdomain">{t.fqdn}</Mono>
              </Detail>
              <Detail k="Private IP">
                <Mono copy="IP">{t.ip}</Mono>
              </Detail>
              <Detail k="Slot">
                <Mono>{t.slot}</Mono>
              </Detail>
              <Detail k="App port">
                <Mono>{t.app_port}</Mono>
              </Detail>
              <Detail k="Image">
                {t.image ? <Mono>{t.image}</Mono> : <span className="text-muted">default page</span>}
              </Detail>
              <Detail k="Lease left">
                {live(t) ? <Countdown iso={t.lease_expires_at} /> : "-"}
                {t.lease_expires_at && <div className="text-xs text-muted">{exact(t.lease_expires_at)}</div>}
              </Detail>
              <Detail k="Created">
                <RelativeTime iso={t.created_at} />
              </Detail>
              <Detail k="Id">
                <Mono>{t.id}</Mono>
              </Detail>
            </dl>
            {admin && <TeamButtons t={t} actions={actions} />}
          </>
        )}
        {actions.dialog}
      </SheetContent>
    </Dialog>
  );
}

// SpinUpDialog registers a team; the answer (202, provisioning) opens its drawer.
export function SpinUpDialog({
  open,
  onOpenChange,
  hackathon,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hackathon?: string;
}) {
  const active = (useHackathons().data ?? []).filter((h) => h.state === "active");
  const [params, setParams] = useSearchParams();
  const [retryIn, setRetryIn] = useState(0);
  const form = useForm<TeamForm, unknown, TeamValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { hackathon: hackathon ?? "", name: "", app_port: 80, image: "" },
  });
  const { errors } = form.formState;

  // Preselect the hackathon from the breadcrumb, or the only active one.
  const names = active.map((h) => h.name).join(",");
  useEffect(() => {
    if (form.getValues("hackathon")) return;
    const list = names ? names.split(",") : [];
    const pick = list.find((n) => n === hackathon) ?? (list.length === 1 ? list[0] : "");
    if (pick) form.setValue("hackathon", pick);
  }, [names, hackathon, form]);

  useEffect(() => {
    if (retryIn <= 0) return;
    const t = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [retryIn]);

  const spinUp = useAction(
    (v: TeamValues) =>
      call(
        api.POST("/v1/hackathons/{h}/teams", {
          params: { path: { h: v.hackathon } },
          body: { name: v.name, app_port: v.app_port, ...(v.image ? { image: v.image } : {}) },
        }),
      ),
    (t) => `${t.name}: provisioning on ${t.ip}`,
    (e) => {
      if (e instanceof ApiError && e.status === 503) {
        setRetryIn(e.retryAfter ?? 60);
        return true;
      }
      if (e instanceof ApiError && e.status === 409) {
        form.setError("name", { message: e.message });
        return true;
      }
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Spin up a team sandbox"
        description="cpd leases an IP and a routing slot now, then starts the sandbox."
      >
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (v) => {
            const t = await spinUp.mutateAsync(v).catch(() => undefined);
            if (!t) return;
            form.reset({ hackathon: v.hackathon, name: "", app_port: 80, image: "" });
            onOpenChange(false);
            const next = new URLSearchParams(params);
            next.delete("new");
            next.set("team", String(t.id));
            setParams(next);
          })}
        >
          <Field label="Hackathon" error={errors.hackathon?.message}>
            <Select {...form.register("hackathon")} aria-invalid={!!errors.hackathon}>
              <option value="">Choose…</option>
              {active.map((h) => (
                <option key={h.id} value={h.name}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
          {active.length === 0 && (
            <p className="text-[13px] text-warn">No active hackathon: create one first.</p>
          )}
          <Field label="Team name" error={errors.name?.message} hint="a DNS label, e.g. team07">
            <Input
              {...form.register("name")}
              placeholder="team07"
              autoComplete="off"
              aria-invalid={!!errors.name}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="App port" error={errors.app_port?.message} hint="80 or 8000-8099">
              <Input
                type="number"
                inputMode="numeric"
                {...form.register("app_port")}
                aria-invalid={!!errors.app_port}
              />
            </Field>
            <Field label="Image (optional)" error={errors.image?.message} hint="empty = default page">
              <Input {...form.register("image")} placeholder="nginx:1.27" autoComplete="off" />
            </Field>
          </div>
          {retryIn > 0 && (
            <p role="alert" className="rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-warn">
              Pool full, retry in {retryIn} s. IPs come back after a teardown and the quarantine.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={spinUp.isPending || retryIn > 0}>
              <Rocket />
              {spinUp.isPending ? "Spinning up…" : "Spin up"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const NoTeams = ({ action }: { action?: React.ReactNode }) => (
  <EmptyState
    title="No team yet"
    hint="Spin one up: it gets an IP, a slot and a subdomain at once."
    action={action}
  />
);
