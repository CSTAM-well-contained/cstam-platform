import { AlertTriangle, WifiOff } from "lucide-react";
import { useStatus } from "@/api/queries";
import { StatusDot } from "@/components/status/status";
import { clock } from "@/lib/format";
import { useHealth } from "@/lib/health";
import { useNow } from "@/lib/use-now";

const STALE_MS = 3000;

function useLive() {
  const { lastOk, down } = useHealth();
  const now = useNow();
  return { connecting: lastOk === 0 && !down, fresh: !down && now - lastOk < STALE_MS, lastOk };
}

export function LivePill() {
  const { connecting, fresh, lastOk } = useLive();
  const text = connecting ? "connecting" : fresh ? "live" : `last update ${lastOk ? clock(lastOk) : "never"}`;
  return (
    <span
      role="status"
      className="inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-xs font-medium"
      title={lastOk ? `last answer from cpd at ${clock(lastOk)}` : undefined}
    >
      <StatusDot tone={connecting ? "idle" : fresh ? "ok" : "bad"} pulse={fresh} />
      <span className={fresh || connecting ? "" : "text-bad"}>{text}</span>
    </span>
  );
}

// Banners: cpd unreachable, then every alert cpd computed (split brain, no master, ...).
export function AlertBanners() {
  const { connecting, fresh, lastOk } = useLive();
  const alerts = useStatus().data?.alerts ?? [];
  if (fresh && !alerts.length) return null;
  return (
    <div className="grid gap-px" role="alert">
      {!fresh && !connecting && (
        <div className="flex items-center gap-2 bg-bad-bg px-4 py-2 text-bad">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          cpd does not answer: the data below may be old
          {lastOk ? ` (last update ${clock(lastOk)})` : ""}.
        </div>
      )}
      {alerts.map((a) => (
        <div key={a} className="flex items-center gap-2 bg-bad-bg px-4 py-2 text-bad">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {a}
        </div>
      ))}
    </div>
  );
}
