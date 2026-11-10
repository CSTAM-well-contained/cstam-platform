import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, call } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { auth, useToken } from "@/lib/auth";

export default function Login() {
  const token = useToken();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [error, setError] = useState(auth.reason() ? `Signed out: ${auth.reason()}` : "");
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (token) return <Navigate to={from} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = value.trim();
    setBusy(true);
    setError("");
    try {
      const who = await call(api.GET("/v1/whoami", { headers: { Authorization: `Bearer ${t}` } }));
      qc.setQueryData(["whoami"], who);
      auth.signIn(t);
      setValue("");
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "This token is refused."
          : `cpd does not answer: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="grid w-full max-w-sm gap-5 rounded-lg border p-6">
        <div className="grid gap-1.5">
          <svg viewBox="0 0 24 24" className="mb-2 size-7" aria-hidden>
            <path d="M12 2 22 20H2Z" fill="currentColor" />
          </svg>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to CSTAM</h1>
          <p className="text-muted">Control plane for team sandboxes, HA gateways and the IP pool.</p>
        </div>
        <Field
          label="Token"
          hint="An admin token can change things; a viewer token only watches. The token stays in this browser tab and is sent only to this server."
        >
          <Input
            type="password"
            autoComplete="current-password"
            required
            minLength={16}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="paste the admin or viewer token"
            autoFocus
          />
        </Field>
        <Button type="submit" disabled={busy}>
          <KeyRound />
          {busy ? "Checking…" : "Continue"}
        </Button>
        {error && (
          <p role="alert" className="text-bad">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
