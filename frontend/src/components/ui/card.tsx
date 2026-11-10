import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-lg border bg-bg", className)} {...p} />
);

export function CardHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
      <h2 className="font-medium">{title}</h2>
      {children}
    </div>
  );
}
