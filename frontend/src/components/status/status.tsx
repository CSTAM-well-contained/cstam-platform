import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ago, exact, left } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "bad" | "info" | "idle";

const dot: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
  idle: "bg-muted",
};
const pill: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-info-bg text-info",
  idle: "bg-hover text-muted",
};

// StatusDot is the Vercel deployment dot; it pulses while something is in progress.
export function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2.5 shrink-0" aria-hidden>
      {pulse && (
        <span
          className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", dot[tone])}
        />
      )}
      <span className={cn("relative inline-flex size-2.5 rounded-full", dot[tone])} />
    </span>
  );
}

// Badge always carries a word (and usually a dot or icon): color is never the only signal.
export function Badge({
  tone = "idle",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
        pill[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const teamTone: Record<string, Tone> = {
  ready: "ok",
  provisioning: "warn",
  deleting: "warn",
  failed: "bad",
  deleted: "idle",
};

export function StateLabel({ state }: { state: string | undefined }) {
  const s = state ?? "unknown";
  const tone = teamTone[s] ?? "idle";
  return (
    <span className="inline-flex items-center gap-2">
      <StatusDot tone={tone} pulse={s === "provisioning" || s === "deleting"} />
      <span className="capitalize">{s}</span>
    </span>
  );
}

export function RelativeTime({ iso, className }: { iso: string | undefined; className?: string }) {
  const now = useNow();
  if (!iso) return <span className={cn("text-muted", className)}>-</span>;
  return (
    <time dateTime={iso} title={exact(iso)} className={className}>
      {ago(iso, now)}
    </time>
  );
}

export function Countdown({ iso }: { iso: string | undefined }) {
  const now = useNow();
  if (!iso) return <span className="text-muted">-</span>;
  const s = (new Date(iso).getTime() - now) / 1000;
  return (
    <time
      dateTime={iso}
      title={`expires ${exact(iso)}`}
      className={cn("font-mono tabular-nums", s <= 0 ? "text-bad" : s < 600 ? "text-warn" : "")}
    >
      {left(iso, now)}
    </time>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          toast.error("Clipboard not available");
        }
      }}
    >
      {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
    </button>
  );
}

// Mono renders an id, IP, slot or version with an optional copy button.
export function Mono({ children, copy }: { children: string | number | undefined; copy?: string }) {
  if (children === undefined || children === "") return <span className="text-muted">-</span>;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[13px]">
      {children}
      {copy && <CopyButton value={String(children)} label={copy} />}
    </span>
  );
}
