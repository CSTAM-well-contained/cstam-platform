import * as D from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { ArrowLeftRight, FileCog, LogOut, Moon, Plus, Rocket, Search, Users } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useIsAdmin, useStatus, useTeams } from "@/api/queries";
import { auth } from "@/lib/auth";
import { nextTheme, setTheme, useTheme } from "@/lib/theme";
import { PAGES } from "./nav";

function Item({ onSelect, children, value }: { onSelect: () => void; children: ReactNode; value: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-hover [&_svg]:size-4 [&_svg]:text-muted"
    >
      {children}
    </Command.Item>
  );
}

const group =
  "px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted";

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const teams = useTeams().data ?? [];
  const gateways = useStatus().data?.gateways ?? [];
  const admin = useIsAdmin();
  const theme = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <D.Content className="fixed top-[15vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border bg-bg">
          <D.Title className="sr-only">Command menu</D.Title>
          <D.Description className="sr-only">Jump to a page or a team, or run an action</D.Description>
          <Command label="Command menu" loop>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted" aria-hidden />
              <Command.Input
                placeholder="Go to a page, a team, or run an action…"
                className="h-11 w-full bg-transparent outline-none placeholder:text-muted"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto">
              <Command.Empty className="px-4 py-6 text-center text-muted">Nothing found.</Command.Empty>
              <Command.Group heading="Pages" className={group}>
                {PAGES.map((p) => (
                  <Item key={p.to} value={`page ${p.label}`} onSelect={run(() => navigate(p.to))}>
                    <FileCog />
                    {p.label}
                  </Item>
                ))}
              </Command.Group>
              {admin && (
                <Command.Group heading="Actions" className={group}>
                  <Item value="spin up a team" onSelect={run(() => navigate("/teams?new=1"))}>
                    <Rocket />
                    Spin up a team
                  </Item>
                  <Item value="new hackathon" onSelect={run(() => navigate("/hackathons?new=1"))}>
                    <Plus />
                    New hackathon
                  </Item>
                  {gateways.map((g) => (
                    <Item
                      key={g.name}
                      value={`planned failover ${g.name}`}
                      onSelect={run(() => navigate(`/?failover=${encodeURIComponent(g.name ?? "")}`))}
                    >
                      <ArrowLeftRight />
                      Planned failover of {g.name}
                    </Item>
                  ))}
                </Command.Group>
              )}
              {teams.length > 0 && (
                <Command.Group heading="Teams" className={group}>
                  {teams.map((t) => (
                    <Item
                      key={t.id}
                      value={`team ${t.name} ${t.hackathon} ${t.fqdn} ${t.ip}`}
                      onSelect={run(() => navigate(`/teams?team=${t.id}`))}
                    >
                      <Users />
                      <span>{t.name}</span>
                      <span className="ml-auto truncate font-mono text-xs text-muted">{t.fqdn}</span>
                    </Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Preferences" className={group}>
                <Item value="theme switch" onSelect={run(() => setTheme(nextTheme(theme)))}>
                  <Moon />
                  Theme: switch to {nextTheme(theme)}
                </Item>
                <Item value="sign out log out" onSelect={run(() => auth.signOut())}>
                  <LogOut />
                  Sign out
                </Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
