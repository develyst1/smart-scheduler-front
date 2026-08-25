"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * SPEC-046 re-cut — what a calendar cell shows beyond `time · name`.
 *
 * 🔴 **Exactly these five.** The re-cut says so in as many words: adding a sixth is a new decision, not an
 * assumption. They are **display-only** — toggling one hides a line, it never filters bookings or changes data,
 * so a hidden field can't make a cell lie about what is booked.
 */
export const CELL_FIELDS = ["type", "program", "badge", "note", "rental"] as const;
export type CellField = (typeof CELL_FIELDS)[number];

export type CellDisplay = Record<CellField, boolean>;

/** Default ALL ON — the re-cut's default, and the honest one: staff opt OUT of detail, they don't hunt for it. */
export const ALL_ON: CellDisplay = { type: true, program: true, badge: true, note: true, rental: true };

const STORAGE_KEY = "ss.cellDisplay";

/**
 * A per-user view preference, not server state — it lives in localStorage like the language toggle does.
 *
 * It is a **module-level external store** on purpose: the toggle (in the header) and the grid that reads it are
 * separate components, each calling `useCellDisplay()`. A plain `useState`-per-call would give each its own copy,
 * so toggling in the menu would leave the grid stale until it remounted. One shared store + `useSyncExternalStore`
 * keeps every reader in lockstep — and the `storage` listener syncs across browser tabs for free.
 */
let state: CellDisplay = ALL_ON;
let hydrated = false;
const listeners = new Set<() => void>();

function readStorage(): CellDisplay {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return ALL_ON;
    const saved = JSON.parse(raw) as Partial<CellDisplay>;
    // Merge over the defaults rather than replacing: a preference saved before a field existed must not
    // leave that field permanently off (and `undefined` must never read as "hidden").
    return { ...ALL_ON, ...saved };
  } catch {
    // A corrupt preference is not worth breaking the calendar over — fall back to showing everything.
    return ALL_ON;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  // Hydrate from localStorage on the first subscription (client only). React re-reads the snapshot right after
  // subscribing, so a value that differs from the SSR default propagates without an explicit emit here.
  if (!hydrated) {
    hydrated = true;
    state = readStorage();
  }
  listeners.add(listener);

  // Cross-tab / cross-instance sync: another tab writing the preference fires `storage` here.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      state = readStorage();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): CellDisplay {
  return state;
}

// SSR / first paint: always the default. Matches getSnapshot before hydration, so there is no hydration mismatch.
function getServerSnapshot(): CellDisplay {
  return ALL_ON;
}

export function toggleField(field: CellField) {
  const next = { ...state, [field]: !state[field] };
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota — the toggle still works for this session.
  }
  emit();
}

export function useCellDisplay() {
  const display = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback((field: CellField) => toggleField(field), []);
  return { display, toggle };
}
