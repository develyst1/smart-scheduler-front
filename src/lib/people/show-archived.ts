"use client";

import { boolStore } from "@/lib/scheduler/cancelled-tray";

/**
 * REQ-093 (TASK-393) — the People page's `Show archived` switch: remembered per browser like the calendar's toggles
 * (the same `boolStore`), default OFF so the everyday list is the working one. Display only — the server decides
 * what is archived; this only reveals the `archivedStudents` the read already carries.
 */
const store = boolStore("ss.showArchivedStudents", false);

export function useShowArchived() {
  const { value, toggle } = store.use();
  return { shown: value, toggle };
}
