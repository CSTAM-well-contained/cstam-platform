import { useSyncExternalStore } from "react";

// Feeds the "live" pill: the time of the last answer from cpd and whether the last call failed
// because cpd (or the proxy in front of it) did not answer.
type Health = { lastOk: number; down: boolean };
let state: Health = { lastOk: 0, down: false };
const listeners = new Set<() => void>();

function set(next: Health) {
  if (next.lastOk === state.lastOk && next.down === state.down) return;
  state = next;
  for (const fn of listeners) fn();
}

export const health = {
  ok: () => set({ lastOk: Date.now(), down: false }),
  fail: () => set({ ...state, down: true }),
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};

export const useHealth = () => useSyncExternalStore(health.subscribe, health.get);
