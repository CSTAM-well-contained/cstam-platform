// Times and sizes as people read them. `now` is passed in so a ticking clock re-renders them.

export function ago(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const exact = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString() : "");

export const clock = (iso: string | number | undefined) =>
  iso === undefined || iso === "" ? "-" : new Date(iso).toLocaleTimeString([], { hour12: false });

// left is a lease countdown: "1h05m", "4m09s" or "expired".
export function left(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "-";
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  if (s <= 0) return "expired";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}m` : `${m}m${String(s % 60).padStart(2, "0")}s`;
}

export function bytes(n: number | undefined): string {
  if (n === undefined) return "-";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function duration(seconds: number | undefined): string {
  if (!seconds) return "-";
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
