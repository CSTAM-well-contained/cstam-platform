import { useSyncExternalStore } from "react";

// The token lives only in this tab's sessionStorage (never localStorage, never logged).
// sessionStorage can throw (blocked storage): the token then lasts until the page reloads.
const KEY = "cstam.token";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

let token = read();
let reason = "";

function emit() {
  for (const fn of listeners) fn();
}

export const auth = {
  token: () => token,
  // Why the last sign-out happened ("" when the user clicked Sign out), shown on the login page.
  reason: () => reason,
  signIn(t: string) {
    token = t;
    reason = "";
    try {
      sessionStorage.setItem(KEY, t);
    } catch {
      /* storage blocked: keep it in memory */
    }
    emit();
  },
  signOut(why = "") {
    token = "";
    reason = why;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    emit();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};

export const useToken = () => useSyncExternalStore(auth.subscribe, auth.token);
