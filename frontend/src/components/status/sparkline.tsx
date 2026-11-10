import { cn } from "@/lib/utils";

// Sparkline: a tiny line of the last samples. The number next to it carries the meaning.
export function Sparkline({
  values,
  className,
  label,
}: {
  values: number[];
  className?: string;
  label: string;
}) {
  const w = 80;
  const h = 24;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - 1 - (v / max) * (h - 2)).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-6 w-20 overflow-visible", className)}
      role="img"
      aria-label={label}
    >
      <line x1="0" y1={h - 0.5} x2={w} y2={h - 0.5} stroke="var(--border)" />
      {values.length > 1 && (
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      )}
    </svg>
  );
}
