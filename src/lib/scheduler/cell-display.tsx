"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * SPEC-046 re-cut — what a calendar cell shows beyond `time · name`.
 *
 * 🔴 **Exactly these five.** Adding a sixth is a new decision, not an assumption. They are **display-only** —
 * toggling one hides a line, it never filters bookings, so a hidden field can't make a cell lie about what is booked.
 */
export const CELL_FIELDS = ["type", "program", "badge", "note", "rental"] as const;
export type CellField = (typeof CELL_FIELDS)[number];

export type CellDisplay = Record<CellField, boolean>;

/** Default ALL ON — staff opt OUT of detail, they don't hunt for it. */
export const ALL_ON: CellDisplay = { type: true, program: true, badge: true, note: true, rental: true };

const STORAGE_KEY = "ss.cellDisplay";

interface CellDisplayValue {
  display: CellDisplay;
  toggle: (field: CellField) => void;
}

/**
 * 🔴 **TASK-191 — this Context exists because the hook alone was the bug.** The first version was a plain hook
 * called independently by the menu and by the grid, which gave each its own `useState`: ticking a box updated the
 * menu and localStorage, while the grid — which only read storage on mount — never re-rendered. Persistence
 * without a shared source looks like it works and doesn't.
 *
 * One provider, one state, one subscription. The persistence is unchanged.
 */
const Ctx = createContext<CellDisplayValue | null>(null);

export function CellDisplayProvider({ children }: { children: React.ReactNode }) {
  const [display, setDisplay] = useState<CellDisplay>(ALL_ON);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<CellDisplay>;
      // Merge over the defaults: a preference saved before a field existed must not leave it permanently off,
      // and `undefined` must never read as "hidden".
      setDisplay({ ...ALL_ON, ...saved });
    } catch {
      // A corrupt preference is not worth breaking the calendar over — show everything.
    }
  }, []);

  const toggle = useCallback((field: CellField) => {
    setDisplay((prev) => {
      const next = { ...prev, [field]: !prev[field] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private mode / quota — the toggle still works for this session.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ display, toggle }), [display, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Read the shared preference. **Throws when there is no provider** rather than silently handing back a private
 * copy — a silent fallback is exactly how the two-independent-states bug hid in the first place.
 */
export function useCellDisplay(): CellDisplayValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCellDisplay must be used within <CellDisplayProvider>");
  return ctx;
}
