import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// ConfirmDialog states the consequence in plain words; with `word`, it must be typed first.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  word,
  confirmLabel,
  destructive = true,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  word?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ok = !word || typed === word;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setTyped("");
        onOpenChange(o);
      }}
    >
      <DialogContent title={title} description={children}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) onConfirm();
          }}
        >
          {word && (
            <label className="grid gap-1.5 text-[13px]">
              <span>
                Type <b className="font-mono">{word}</b> to confirm
              </span>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={destructive ? "danger" : "default"} disabled={!ok || pending}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
