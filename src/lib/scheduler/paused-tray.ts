"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the พัก tray (`PausedTray`) is collapsed — a per-user view preference, stored like the cell-display
 * toggle and the language toggle.
 *
 * 🔴 **It is a module-level external store, not `useState`, and that is load-bearing here rather than stylistic.**
 * `CalendarContent` renders `PausedTray` **TWICE** — the `rail` (≥2xl, beside the grid) and the `strip`
 * (narrower screens, above it) — and picks between them with CSS, not JavaScript. Two `useState`s would be two
 * independent copies: collapse the strip, resize past the breakpoint, and the rail is still open. One shared
 * store keeps both instances on the same value, and the `storage` listener syncs other browser tabs for free.
 * (The same reasoning, and the same shape, as `cell-display.ts`.)
 *
 * 🔴 **Default EXPANDED**, deliberately. REQ-076 AC-9 puts the tray on the calendar page so an admin doing
 * ordinary booking work *notices* it; a tray that ships collapsed hands that back. Staff opt OUT of the list,
 * the way they opt out of cell fields — they never have to go looking for it first.
 *
 * ⚠️ **Collapsed gives the grid back its width; it never removes the tray.** On the rail the card becomes a
 * `w-10` spine still carrying the icon, the count and the name — AC-9 and AC-11 hold at 40px. A collapse that
 * took the tray off screen would put a paused booking nowhere at all, since it is already off the calendar.
 *
 * 🔴 Two components read this: `PausedTray` (what it draws) and `CalendarContent` (the `<aside>`'s width). Both
 * read the SAME value, which is the other half of why this is a store and not component state.
 */

const STORAGE_KEY = "ss.pausedTrayCollapsed";

/** `"1"` is the only truthy value written. Anything else — absent, corrupt, an older format — reads as expanded,
 *  which is the safe direction: it shows the list rather than hiding work behind a preference nobody set. */
const COLLAPSED = "1";

let state = false;
let hydrated = false;
const listeners = new Set<() => void>();

function readStorage(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === COLLAPSED;
  } catch {
    // Private mode / blocked site data — an unreadable preference must not cost the tray its contents.
    return false;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  // Hydrate on the first subscription (client only). React re-reads the snapshot straight after subscribing, so
  // a stored value that differs from the SSR default propagates without an explicit emit here.
  if (!hydrated) {
    hydrated = true;
    state = readStorage();
  }
  listeners.add(listener);

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

function getSnapshot(): boolean {
  return state;
}

/** SSR / first paint: always expanded. Matches `getSnapshot` before hydration ⇒ no hydration mismatch. */
function getServerSnapshot(): boolean {
  return false;
}

export function toggleCollapsed() {
  const next = !state;
  state = next;
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, COLLAPSED);
    // Removed rather than written as `"0"`: absent and expanded are the same state, so there is one
    // representation of it instead of two that a future reader could disagree about.
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Quota / private mode — the toggle still works for this session, it just will not be remembered.
  }
  emit();
}

export function usePausedTrayCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => toggleCollapsed(), []);
  return { collapsed, toggle };
}

/** Test seam — resets the module between cases. 🚫 Not for app code: nothing in the UI needs to force a state. */
export function __resetPausedTrayStore() {
  state = false;
  hydrated = false;
  listeners.clear();
}
