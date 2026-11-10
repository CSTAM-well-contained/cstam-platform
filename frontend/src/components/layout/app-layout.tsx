import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useToken } from "@/lib/auth";
import { AlertBanners } from "./live";
import { CommandMenu } from "./command-menu";
import { TabNav, TopBar } from "./top-bar";

export function AppLayout() {
  const token = useToken();
  const qc = useQueryClient();
  const location = useLocation();
  const [cmd, setCmd] = useState(false);

  // Signed out (button or 401): drop every cached answer of the old token.
  useEffect(() => {
    if (!token) qc.clear();
  }, [token, qc]);

  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-30 border-b-0 bg-bg/90 backdrop-blur">
        <TopBar onCommand={() => setCmd(true)} />
        <TabNav />
      </div>
      <AlertBanners />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      <CommandMenu open={cmd} onOpenChange={setCmd} />
    </div>
  );
}
