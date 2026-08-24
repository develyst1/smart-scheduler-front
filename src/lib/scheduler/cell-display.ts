"use client";

import { useCallback, useEffect, useState } from "react";

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

/** A per-user view preference, not server state — it lives in localStorage like the language toggle does. */
export function useCellDisplay() {
  const [display, setDisplay] = useState<CellDisplay>(ALL_ON);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<CellDisplay>;
      // Merge over the defaults rather than replacing: a preference saved before a field existed must not
      // leave that field permanently off (and `undefined` must never read as "hidden").
      setDisplay({ ...ALL_ON, ...saved });
    } catch {
      // A corrupt preference is not worth breaking the calendar over — fall back to showing everything.
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

  return { display, toggle };
}
