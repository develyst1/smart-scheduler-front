"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CANCEL_REASON_CODES, type CancelReasonCode } from "@/types/app/scheduler";

/**
 * TASK-369 (`REQ-089 §5` / `§5.1`) — the CANCELLED tray's two per-user flags, stored the way the paused tray's and
 * the cell-display toggles are: a module-level external store over `localStorage`, one value shared by every
 * reader (`CellDisplayMenu` writes `shown`; `CalendarContent` reads it for the request AND the `<aside>` width;
 * the tray reads `collapsed` in both its `rail` and `strip` instances). Same reasoning as `paused-tray.ts`,
 * expressed once as a factory so the second tray does not become a third copy of the same forty lines.
 *
 * 🔴 `shown` is NOT a cell field. `CELL_FIELDS` is "exactly five, display-only, never filters bookings" — this
 * flag REVEALS a tray and changes the calendar REQUEST (`includeCancelled=true`), so it lives beside the five in
 * the same menu, not among them.
 */
export function boolStore(storageKey: string, serverDefault: boolean) {
  const TRUE = "1";
  let state = serverDefault;
  let hydrated = false;
  const listeners = new Set<() => void>();
  const read = (): boolean => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw === null ? serverDefault : raw === TRUE;
    } catch {
      return serverDefault;
    }
  };
  const emit = () => {
    for (const l of listeners) l();
  };
  const subscribe = (listener: () => void) => {
    if (!hydrated) {
      hydrated = true;
      state = read();
    }
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) {
        state = read();
        emit();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };
  const set = (next: boolean) => {
    state = next;
    try {
      window.localStorage.setItem(storageKey, next ? TRUE : "0");
    } catch {
      // private mode / quota — the toggle still works for this session
    }
    emit();
  };
  const use = () => {
    const value = useSyncExternalStore(subscribe, () => state, () => serverDefault);
    const toggle = useCallback(() => set(!state), []);
    return { value, toggle };
  };
  return { use };
}

/** The `Show cancelled` switch — default OFF: the owner asked for a toggle, so the everyday calendar is unchanged. */
const shownStore = boolStore("ss.showCancelled", false);
/** The cancelled tray's fold — default EXPANDED, like the paused tray's (staff opt OUT of the list). */
const collapsedStore = boolStore("ss.cancelledTrayCollapsed", false);

export function useShowCancelled() {
  const { value, toggle } = shownStore.use();
  return { shown: value, toggle };
}

export function useCancelledTrayCollapsed() {
  const { value, toggle } = collapsedStore.use();
  return { collapsed: value, toggle };
}

/**
 * What a cancelled row shows as its reason: the closed code's EXISTING label (`endCourse.<code>`, the three reasons
 * REQ-036/REQ-074 already share) when `cancelReason` is one, else the human `note`, else nothing. 🚫 No new label
 * key for a code; no client-side filtering by reason.
 */
export const cancelReasonDisplay = (
  cancelReason: string | null | undefined,
  note: string | null | undefined,
): { key: `endCourse.${CancelReasonCode}` } | { text: string } | null => {
  // TASK-407 — the wider READ set: the three admin reasons + `TEACHER_LEAVE` (the teacher's own leave writes it).
  if (cancelReason && (CANCEL_REASON_CODES as readonly string[]).includes(cancelReason)) {
    return { key: `endCourse.${cancelReason as CancelReasonCode}` };
  }
  const text = note?.trim();
  return text ? { text } : null;
};
