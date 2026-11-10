import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogClose = D.Close;

const overlay = "fixed inset-0 z-40 bg-black/60";

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-bg p-5",
          className,
        )}
      >
        <div className="grid gap-1.5 pr-6">
          <D.Title className="text-base font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="text-muted">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
        </div>
        {children}
        <D.Close className="absolute top-4 right-4 rounded-sm text-muted hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

// Sheet is a dialog sliding from the right (detail drawers).
export function SheetContent({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col gap-4 overflow-y-auto border-l bg-bg p-5">
        <div className="flex items-start justify-between gap-4">
          <D.Title className="text-base font-semibold">{title}</D.Title>
          <D.Close className="rounded-sm text-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <D.Description className="sr-only">Details</D.Description>
        {children}
      </D.Content>
    </D.Portal>
  );
}
