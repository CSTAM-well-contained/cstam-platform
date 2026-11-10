import { LogOut, Monitor, Moon, Search, Sun } from "lucide-react";
import { NavLink, useSearchParams } from "react-router";
import { useHackathons, useWhoami } from "@/api/queries";
import { Badge } from "@/components/status/status";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { nextTheme, setTheme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { LivePill } from "./live";
import { PAGES } from "./nav";

function HackathonSwitcher() {
  const [params, setParams] = useSearchParams();
  const { data } = useHackathons();
  const h = params.get("h") ?? "";
  return (
    <select
      aria-label="Hackathon"
      value={h}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set("h", e.target.value);
        else next.delete("h");
        setParams(next);
      }}
      className="h-8 max-w-44 truncate rounded-md bg-transparent px-1.5 font-medium hover:bg-hover"
    >
      <option value="">All hackathons</option>
      {data?.map((x) => (
        <option key={x.id} value={x.name}>
          {x.name}
          {x.state === "ended" ? " (ended)" : ""}
        </option>
      ))}
      {h && !data?.some((x) => x.name === h) && <option value={h}>{h}</option>}
    </select>
  );
}

const themeIcon = { system: Monitor, dark: Moon, light: Sun };

export function TopBar({ onCommand }: { onCommand: () => void }) {
  const role = useWhoami().data?.role;
  const theme = useTheme();
  const ThemeIcon = themeIcon[theme];
  return (
    <header className="flex h-14 items-center gap-2 px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <NavLink to="/" className="flex items-center gap-2 font-semibold" aria-label="CSTAM overview">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path d="M12 2 22 20H2Z" fill="currentColor" />
          </svg>
          <span className="hidden sm:inline">CSTAM</span>
        </NavLink>
        <span className="text-border select-none" aria-hidden>
          /
        </span>
        <HackathonSwitcher />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {role === "viewer" && <Badge tone="warn">read-only</Badge>}
        <LivePill />
        <Button
          variant="secondary"
          size="sm"
          onClick={onCommand}
          className="hidden text-muted sm:inline-flex"
          aria-label="Open the command menu"
        >
          <Search />
          <span>Search…</span>
          <kbd className="ml-2 rounded border px-1 font-mono text-[11px]">⌘K</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCommand}
          className="sm:hidden"
          aria-label="Open the command menu"
        >
          <Search />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(nextTheme(theme))}
          aria-label={`Theme: ${theme}. Switch to ${nextTheme(theme)}`}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => auth.signOut()}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut />
        </Button>
      </div>
    </header>
  );
}

export function TabNav() {
  const [params] = useSearchParams();
  const h = params.get("h");
  const search = h ? `?h=${encodeURIComponent(h)}` : "";
  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none]">
      {PAGES.map((p) => (
        <NavLink
          key={p.to}
          to={p.to + search}
          end={p.to === "/"}
          className={({ isActive }) =>
            cn(
              "relative px-2.5 py-3 whitespace-nowrap text-muted transition-colors hover:text-fg",
              isActive && "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-fg",
            )
          }
        >
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}
