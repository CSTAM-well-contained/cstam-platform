import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, LogOut, RefreshCw, Rocket } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Navigate } from "react-router";
import { api, ApiError, call, errorText } from "@/api/client";
import { useAction, useWhoami } from "@/api/queries";
import { Countdown, Mono, StateLabel, TeamLink } from "@/components/status/status";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { auth, useToken } from "@/lib/auth";
import { teamUrl, usePublicEnv } from "@/lib/public-url";
import { deploySchema, type DeployForm, type DeployValues } from "@/lib/validation";

// Images a team can try at once; each listens on the port given here.
const EXAMPLES = [
  { image: "nginx:alpine", port: 80, what: "nginx welcome page" },
  { image: "traefik/whoami", port: 80, what: "echoes the request" },
  { image: "", port: 80, what: "the platform's default page" },
];

function useMyTeam() {
  return useQuery({
    queryKey: ["myteam"],
    queryFn: () => call(api.GET("/v1/team")),
    refetchInterval: 1500,
    refetchIntervalInBackground: false,
  });
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-3 border-b py-2.5 text-[13px] last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// TeamPortal: what a team sees with its own token. Its sandbox, its public address, deploy
// an image, publish or hide the subdomain, extend the lease. No other team, no platform data.
export default function TeamPortal() {
  const token = useToken();
  const who = useWhoami();
  const qc = useQueryClient();
  useEffect(() => {
    if (!token) qc.clear();
  }, [token, qc]);

  if (!token) return <Navigate to="/login" replace />;
  if (who.isLoading) return <p className="p-8 text-muted">Loading…</p>;
  if (who.data && who.data.role !== "team") return <Navigate to="/" replace />;
  return <Portal team={who.data?.team ?? ""} hackathon={who.data?.hackathon ?? ""} />;
}

function Portal({ team, hackathon }: { team: string; hackathon: string }) {
  const { data: t, error } = useMyTeam();
  const { publicPort } = usePublicEnv();
  const form = useForm<DeployForm, unknown, DeployValues>({
    resolver: zodResolver(deploySchema),
    defaultValues: { image: "", app_port: 80 },
  });
  const { errors } = form.formState;

  // Start the form from what runs now, once.
  const loaded = !!t;
  useEffect(() => {
    if (t) form.reset({ image: t.image ?? "", app_port: t.app_port ?? 80 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const deploy = useAction(
    (v: DeployValues) =>
      call(api.POST("/v1/team/deploy", { body: { image: v.image, app_port: v.app_port } })),
    (r) => `Deploying ${r.image || "the default page"}…`,
  );
  const expose = useAction(
    (exposed: boolean) => call(api.POST("/v1/team/expose", { body: { exposed } })),
    (r) => (r.exposed ? "Your app is public" : "Your app is private: the subdomain answers 404"),
  );
  const renew = useAction(
    () => call(api.POST("/v1/team/renew")),
    () => "Lease extended",
  );

  const busy = t?.state === "provisioning";
  const url = t?.fqdn ? teamUrl(t.fqdn, publicPort) : "";

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path d="M12 2 22 20H2Z" fill="currentColor" />
          </svg>
          <span className="font-semibold">CSTAM</span>
          <span className="text-muted">/ team portal</span>
        </div>
        <div className="flex items-center gap-3 text-[13px]">
          <span className="font-mono">
            {team}
            <span className="text-muted"> @ {hackathon}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => auth.signOut()} aria-label="Sign out">
            <LogOut />
          </Button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your sandbox</h1>
          <p className="text-muted">
            Deploy a container image, then choose whether it is published at your subdomain.
          </p>
        </div>

        {error && !(error instanceof ApiError && error.status === 401) && (
          <p className="rounded-md border border-bad/40 bg-bad-bg px-3 py-2 text-bad" role="alert">
            {errorText(error)}
          </p>
        )}
        {t?.error && (
          <p className="rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-warn" role="alert">
            {t.error}
          </p>
        )}
        {busy && (
          <p className="rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-warn" role="status">
            Starting your app. Visitors see a maintenance page for a few seconds; this page updates by itself.
          </p>
        )}

        <Card>
          <CardHeader title="Your app">
            {t && (
              <Button
                variant="secondary"
                size="sm"
                disabled={expose.isPending || t.state === "deleting"}
                onClick={() => expose.mutate(!t.exposed)}
              >
                {t.exposed ? <EyeOff /> : <Eye />}
                {t.exposed ? "Make private" : "Make public"}
              </Button>
            )}
          </CardHeader>
          <dl className="px-4">
            <Row k="Address">
              {url ? <Mono copy="address">{url}</Mono> : <span className="text-muted">-</span>}
              {t?.exposed && <TeamLink fqdn={t.fqdn} ready={t.state === "ready"} />}
            </Row>
            <Row k="Visibility">
              {t ? (
                t.exposed ? (
                  <span className="text-ok">public: routed on both gateways</span>
                ) : (
                  <span className="text-muted">
                    private: the subdomain answers 404, your app keeps running
                  </span>
                )
              ) : (
                "-"
              )}
            </Row>
            <Row k="State">
              <StateLabel state={t?.state} />
            </Row>
            <Row k="Running">
              {t ? <Mono>{`${t.image || "default page"} on port ${t.app_port}`}</Mono> : "-"}
            </Row>
            <Row k="Private IP">
              <Mono>{t?.ip}</Mono>
            </Row>
            <Row k="Lease left">
              <span className="inline-flex items-center gap-3">
                {t?.lease_expires_at ? <Countdown iso={t.lease_expires_at} /> : "-"}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={renew.isPending}
                  onClick={() => renew.mutate(undefined)}
                >
                  <RefreshCw />
                  Extend
                </Button>
              </span>
            </Row>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Deploy" />
          <form noValidate className="grid gap-4 p-4" onSubmit={form.handleSubmit((v) => deploy.mutate(v))}>
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <Field
                label="Container image"
                error={errors.image?.message}
                hint="Any public image, or one you pushed to a registry. Empty = the default page."
              >
                <Input {...form.register("image")} placeholder="nginx:alpine" autoComplete="off" />
              </Field>
              <Field label="Port it listens on" error={errors.app_port?.message} hint="80 or 8000-8099">
                <Input type="number" {...form.register("app_port")} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-muted">Try:</span>
              {EXAMPLES.map((e) => (
                <Button
                  key={e.image || "default"}
                  type="button"
                  variant="secondary"
                  size="sm"
                  title={e.what}
                  onClick={() => form.reset({ image: e.image, app_port: e.port })}
                >
                  {e.image || "default page"}
                </Button>
              ))}
            </div>
            <div>
              <Button type="submit" disabled={deploy.isPending || busy || !t || t.state !== "ready"}>
                <Rocket />
                {busy ? "Deploying…" : "Deploy"}
              </Button>
            </div>
            <p className="text-xs text-muted">
              Your sandbox keeps its IP and subdomain. If the new image does not start, the previous version
              comes back and the reason shows above.
            </p>
          </form>
        </Card>
      </main>
    </div>
  );
}
