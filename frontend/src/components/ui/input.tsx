import {
  cloneElement,
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-md border bg-bg px-3 text-sm placeholder:text-muted focus-visible:outline-2 disabled:opacity-50 aria-[invalid=true]:border-bad";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(field, "h-9", className)} {...p} />,
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => (
    <textarea ref={ref} className={cn(field, "py-2 font-mono text-xs", className)} {...p} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...p }, ref) => <select ref={ref} className={cn(field, "h-9 pr-8", className)} {...p} />,
);
Select.displayName = "Select";

// Field wraps a control with its label, an optional hint and the validation error; the hint
// and error are announced as the control's description, not as part of its name.
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
  className?: string;
}) {
  const id = useId();
  const note = error || hint ? `${id}-note` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      {cloneElement(children, { id, "aria-describedby": note })}
      {error ? (
        <span id={note} className="text-xs text-bad" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={note} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
