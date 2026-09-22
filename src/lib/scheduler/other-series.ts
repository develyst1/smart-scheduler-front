/**
 * REQ-101 / SPEC-088 Part A (TASK-428/429) — the ECA/Free/KOL Manage-plan page, the pure side. The SERVER owns every
 * rule (one tx per door, the slot check — `409 SLOT_TAKEN` naming date · hour · teacher, `ALREADY_ON_ROW`,
 * `PRIMARY_TEACHER`, `DATE_EXISTS`; the coach notices). This file: which doors show (the keys + the rows), the
 * cancel-all body, the `fromDate` default, and the status counts the header prints. 🚫 No slot logic, no date
 * arithmetic beyond "today".
 */
import type { EndCourseReason } from "@/types/app/scheduler";

export interface OtherSeriesRow {
  bookingId: string;
  date: string;
  status: string;
  teacherId: string;
  additionalTeacherIds: string[];
}
export interface OtherSeriesLike {
  rows: readonly OtherSeriesRow[];
}

/** The statuses the page counts. `live` = not cancelled and not attended (what confirm/cancel-all act on). */
export const statusCounts = (rows: readonly Pick<OtherSeriesRow, "status">[]) => {
  const pending = rows.filter((r) => r.status === "PENDING").length;
  const attended = rows.filter((r) => r.status === "ATTENDED").length;
  const cancelled = rows.filter((r) => r.status === "CANCELLED").length;
  const live = rows.length - attended - cancelled;
  return { pending, live, attended, cancelled, total: rows.length };
};

export interface SeriesDoors {
  confirmAll: boolean;
  cancelAll: boolean;
  addTeacher: boolean;
  removeTeacher: boolean;
  swapPrimary: boolean;
  addDates: boolean;
  editHeader: boolean;
}

/** The four grants the page asks at its site (`can()`, as every site does): status · key 58 · booking-edit · other-series. */
export interface SeriesGrants {
  status: boolean;
  cancelAll: boolean;
  edit: boolean;
  series: boolean;
}

/**
 * Which series doors show — each by its grant (hidden without it, never disabled); confirm-all also needs a PENDING
 * row, cancel-all a LIVE row (nothing to act on ⇒ no door). Key 58 ALONE gates cancel-all (not `calendar.status`).
 */
export const seriesDoors = (grants: SeriesGrants, series: OtherSeriesLike | null | undefined): SeriesDoors => {
  const counts = statusCounts(series?.rows ?? []);
  return {
    confirmAll: grants.status && counts.pending > 0,
    cancelAll: grants.cancelAll && counts.live > 0,
    addTeacher: grants.edit,
    removeTeacher: grants.edit,
    swapPrimary: grants.edit,
    addDates: grants.series,
    editHeader: grants.edit,
  };
};

/** `POST …/:key/cancel-all { reasonCode, note? }` — the note rides only when typed. */
export const cancelAllBody = (reason: EndCourseReason, note: string): { reasonCode: EndCourseReason; note?: string } => ({
  reasonCode: reason,
  ...(note.trim() ? { note: note.trim() } : {}),
});

/** `fromDate` defaults to TODAY (past rows are history); ISO `YYYY-MM-DD` of the given clock. */
export const fromDateDefault = (today: Date = new Date()): string => {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** The teacher bodies — `fromDate` rides only when it differs from the default (the server defaults to today too). */
export const withFromDate = <T extends object>(body: T, fromDate: string, today = fromDateDefault()): T & { fromDate?: string } => (fromDate && fromDate !== today ? { ...body, fromDate } : body);
