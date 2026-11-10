import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border", className)}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export const Th = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn(
      "sticky top-0 border-b bg-subtle px-3 py-2 text-xs font-medium whitespace-nowrap text-muted",
      className,
    )}
    {...p}
  />
);
export const Td = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("border-b px-3 py-2 align-middle", className)} {...p} />
);
export const Tr = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("last:[&>td]:border-b-0 hover:bg-subtle", className)} {...p} />
);

export function SkeletonRows({ cols, rows = 4 }: { cols: number; rows?: number }) {
  return Array.from({ length: rows }, (_, i) => (
    <tr key={i}>
      {Array.from({ length: cols }, (_, j) => (
        <Td key={j}>
          <Skeleton className="h-4 w-full max-w-32" />
        </Td>
      ))}
    </tr>
  ));
}

// EmptyState: one line saying why it is empty, and the one thing to do about it.
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-md text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div role="alert" className="rounded-lg border border-bad/40 bg-bad-bg px-4 py-3 text-bad">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}
