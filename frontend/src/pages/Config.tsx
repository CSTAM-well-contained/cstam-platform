import { zodResolver } from "@hookform/resolvers/zod";
import { History, Upload } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { api, call, type ConfigVersion } from "@/api/client";
import { useAction, useConfigVersions, useIsAdmin, useStatus } from "@/api/queries";
import { ConfirmDialog } from "@/components/layout/confirm";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Mono, RelativeTime, type Tone } from "@/components/status/status";
import { EmptyState, ErrorState, SkeletonRows, Table, Td, Th, Tr } from "@/components/tables/table";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { configSchema, type ConfigForm, type ConfigValues } from "@/lib/validation";

const outcomeTone: Record<string, Tone> = {
  applied: "ok",
  rejected: "bad",
  rolled_back: "bad",
  failed: "bad",
};

// Demo presets from the old dashboard: one valid but broken config (the gateway rolls it back
// by itself after the health check fails), one syntax error (haproxy -c rejects it).
const PRESETS = [
  {
    label: "valid but broken",
    extra: "http-request return status 500 if { path /__gw/healthz }",
    reason: "demo: valid syntax, health check broken",
  },
  { label: "syntax error", extra: "this-is-not-a-directive", reason: "demo: syntax error" },
];

function PushForm({ current }: { current: ConfigVersion | undefined }) {
  const form = useForm<ConfigForm, unknown, ConfigValues>({
    resolver: zodResolver(configSchema),
    defaultValues: { rate_limit: current?.rate_limit ?? 2000, extra: "", reason: "" },
  });
  const { errors } = form.formState;
  const push = useAction(
    (v: ConfigValues) => call(api.POST("/v1/config", { body: v })),
    (v) => `${v.version} pushed: watch the gateways below`,
  );
  return (
    <Card>
      <CardHeader title="Push a config version" />
      <form
        noValidate
        className="grid gap-4 p-4"
        onSubmit={form.handleSubmit(async (v) => {
          const ok = await push.mutateAsync(v).catch(() => undefined);
          if (ok) form.reset({ rate_limit: ok.rate_limit, extra: "", reason: "" });
        })}
      >
        <p className="text-[13px] text-muted">
          Each gateway checks it with <code className="font-mono">haproxy -c</code>, reloads without dropping
          connections, verifies it serves, and rolls back by itself if not.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rate limit" hint="requests per 10 s per team" error={errors.rate_limit?.message}>
            <Input
              type="number"
              inputMode="numeric"
              {...form.register("rate_limit")}
              aria-invalid={!!errors.rate_limit}
            />
          </Field>
          <Field label="Reason" error={errors.reason?.message}>
            <Input {...form.register("reason")} maxLength={200} placeholder="why" autoComplete="off" />
          </Field>
        </div>
        <Field
          label="Extra frontend lines (advanced)"
          hint="raw HAProxy lines, one per line, at most 20"
          error={
            errors.extra?.message ??
            (errors.extra as unknown as { root?: { message?: string } })?.root?.message
          }
        >
          <Textarea rows={3} spellCheck={false} {...form.register("extra")} aria-invalid={!!errors.extra} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={push.isPending}>
            <Upload />
            Push
          </Button>
          <span className="ml-2 text-xs text-muted">Demo presets:</span>
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                form.setValue("extra", p.extra);
                form.setValue("reason", p.reason);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </form>
    </Card>
  );
}

export default function Config() {
  const versions = useConfigVersions();
  const gateways = useStatus().data?.gateways ?? [];
  const admin = useIsAdmin();
  const [target, setTarget] = useState<ConfigVersion | null>(null);
  const rollback = useAction(
    (v: string) => call(api.POST("/v1/config/{v}/rollback", { params: { path: { v } } })),
    (n) => `${n.version} pushed (${n.reason || "rollback"})`,
  );
  const list = versions.data ?? [];
  const current = list.find((v) => v.current);
  const nameOf = (id?: number) =>
    list.find((v) => v.id === id)?.version ?? (id !== undefined ? `#${id}` : "");

  return (
    <>
      <PageHeader
        title="Config"
        description="HAProxy config versions owned by cpd. History is never rewritten: a rollback is a new version."
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {admin && (versions.data || versions.error) && <PushForm key={current?.id ?? 0} current={current} />}

        <section>
          <h2 className="mb-3 font-medium">Gateways</h2>
          {gateways.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Gateway</Th>
                  <Th>Serves</Th>
                  <Th>Last tried</Th>
                  <Th>Outcome</Th>
                  <Th>Error</Th>
                </tr>
              </thead>
              <tbody>
                {gateways.map((g) => (
                  <Tr key={g.name}>
                    <Td className="font-mono">{g.name}</Td>
                    <Td>
                      <Mono>{g.config_version}</Mono>
                    </Td>
                    <Td>
                      <Mono>{g.config_tried}</Mono>
                    </Td>
                    <Td>
                      {g.config_outcome ? (
                        <Badge tone={outcomeTone[g.config_outcome]}>
                          {g.config_outcome.replace("_", " ")}
                        </Badge>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </Td>
                    <Td className="max-w-md font-mono text-xs break-words whitespace-pre-wrap text-bad">
                      {g.config_error}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No gateway has reported yet" />
          )}
        </section>

        <section>
          <h2 className="mb-3 font-medium">Versions</h2>
          {versions.error && !versions.data ? (
            <ErrorState error={versions.error} />
          ) : !versions.isPending && !list.length ? (
            <EmptyState
              title="No version pushed yet"
              hint="The gateways use their command-line settings until the first push."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Version</Th>
                  <Th>Created</Th>
                  <Th>Rate limit</Th>
                  <Th>Extra lines</Th>
                  <Th>Reason</Th>
                  {admin && (
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {versions.isPending ? (
                  <SkeletonRows cols={admin ? 6 : 5} />
                ) : (
                  list.map((v) => (
                    <Tr key={v.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Mono>{v.version}</Mono>
                          {v.current && <Badge tone="ok">current</Badge>}
                        </div>
                        {v.copied_from !== undefined && v.copied_from !== 0 && (
                          <div className="text-xs text-muted">copy of {nameOf(v.copied_from)}</div>
                        )}
                      </Td>
                      <Td>
                        <RelativeTime iso={v.created_at} />
                      </Td>
                      <Td className="tabular-nums">{v.rate_limit}</Td>
                      <Td className="max-w-sm font-mono text-xs whitespace-pre-wrap">
                        {v.extra?.length ? v.extra.join("\n") : <span className="text-muted">-</span>}
                      </Td>
                      <Td className="max-w-xs">{v.reason || <span className="text-muted">-</span>}</Td>
                      {admin && (
                        <Td className="text-right">
                          {!v.current && (
                            <Button variant="secondary" size="sm" onClick={() => setTarget(v)}>
                              <History />
                              Roll back
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
        </section>
      </div>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Roll back to ${target?.version ?? ""}?`}
        confirmLabel="Roll back"
        destructive={false}
        pending={rollback.isPending}
        onConfirm={() => {
          if (target?.version) rollback.mutate(target.version);
          setTarget(null);
        }}
      >
        A new version is created with the content of {target?.version}; both gateways check it, reload without
        dropping connections, and verify it serves.
      </ConfirmDialog>
    </>
  );
}
