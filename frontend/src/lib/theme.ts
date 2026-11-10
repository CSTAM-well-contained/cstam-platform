import { useSyncExternalStore } from "react";

// Theme: "system" (default), "dark" or "light". The choice is a per-browser convenience, so
// localStorage is fine; it may throw and then the page simply follows the system.
export type Theme = "system" | "dark" | "light";
const KEY = "cstam.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function stored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
}

let theme = stored();

export function applyTheme() {
  const dark = theme === "dark" || (theme === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

media.addEventListener("change", applyTheme);

export function setTheme(t: Theme) {
  theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme();
  for (const fn of listeners) fn();
}

export const nextTheme = (t: Theme): Theme => (t === "system" ? "dark" : t === "dark" ? "light" : "system");

export const useTheme = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => theme,
  );
