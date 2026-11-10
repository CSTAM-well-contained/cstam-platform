import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { api, ApiError, call, type Hackathon } from "@/api/client";
import { useAction } from "@/api/queries";
import { ConfirmDialog } from "@/components/layout/confirm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { hackathonSchema, type HackathonForm, type HackathonValues } from "@/lib/validation";

export function NewHackathonDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const form = useForm<HackathonForm, unknown, HackathonValues>({
    resolver: zodResolver(hackathonSchema),
    defaultValues: { name: "", domain: "", lease_minutes: 120 },
  });
  const { errors } = form.formState;
  const create = useAction(
    (v: HackathonValues) =>
      call(
        api.POST("/v1/hackathons", {
          body: { name: v.name, domain: v.domain, lease_ttl_seconds: v.lease_minutes * 60 },
        }),
      ),
    (x) => `Hackathon ${x.name} created (${x.domain})`,
    (e) => {
      if (e instanceof ApiError && e.status === 409) {
        form.setError("name", { message: e.message });
        return true;
      }
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New hackathon" description="Teams are published at <team>.<domain>.">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (v) => {
            const x = await create.mutateAsync(v).catch(() => undefined);
            if (!x) return;
            form.reset();
            onOpenChange(false);
            navigate(`/hackathons/${encodeURIComponent(x.name ?? "")}`);
          })}
        >
          <Field
            label="Name"
            error={errors.name?.message}
            hint="a DNS label; it stays taken after the hackathon ends"
          >
            <Input
              {...form.register("name")}
              placeholder="hack1"
              autoComplete="off"
              aria-invalid={!!errors.name}
            />
          </Field>
          <Field label="Domain" error={errors.domain?.message}>
            <Input
              {...form.register("domain")}
              placeholder="hack1.cstam.felcloud.tn"
              autoComplete="off"
              aria-invalid={!!errors.domain}
            />
          </Field>
          <Field
            label="Team lease (minutes)"
            error={errors.lease_minutes?.message}
            hint="default 120 (2 h); renewing a team adds this again"
          >
            <Input
              type="number"
              inputMode="numeric"
              {...form.register("lease_minutes")}
              aria-invalid={!!errors.lease_minutes}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EndHackathonDialog({
  hackathon,
  onClose,
}: {
  hackathon: Hackathon | null;
  onClose: () => void;
}) {
  const end = useAction(
    (name: string) => call(api.DELETE("/v1/hackathons/{h}", { params: { path: { h: name } } })),
    (_, name) => `${name}: ending, every team is being torn down`,
  );
  return (
    <ConfirmDialog
      open={!!hackathon}
      onOpenChange={(o) => !o && onClose()}
      title={`End ${hackathon?.name ?? ""}?`}
      word={hackathon?.name}
      confirmLabel="End hackathon"
      pending={end.isPending}
      onConfirm={() => {
        if (hackathon?.name) end.mutate(hackathon.name);
        onClose();
      }}
    >
      Every team of this hackathon is torn down: routes removed from both gateways, sandboxes deleted, IPs
      returned to the pool. The name stays taken. This cannot be undone.
    </ConfirmDialog>
  );
}
