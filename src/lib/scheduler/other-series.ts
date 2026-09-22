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

// ──────────── REQ-104 §2 items 1–3 (TASK-441/442) — the GROUP face of the ONE series modal ────────────

/** Which series the modal shows: an ECA/Free/KOL series (`/other-series/:key`) or a DUO/Group series (`/group-series/:key`). */
export interface SeriesRef {
  kind: "other" | "group";
  key: string;
}

/** The API prefix per kind — the nine group routes are the OTHER routes' twins one-for-one. */
export const seriesPath = (ref: SeriesRef, suffix = ""): string =>
  `/${ref.kind === "group" ? "group-series" : "other-series"}/${encodeURIComponent(ref.key)}${suffix}`;

/** The kind chip's copy key: the group's DUO/Group family vs the OTHER ECA/Free/KOL family. */
export const kindLabelKey = (ref: Pick<SeriesRef, "kind">, kind: string | null): string | null =>
  kind ? `booking.${ref.kind === "group" ? "groupKind" : "otherKind"}_${kind}` : null;

/**
 * The primary swap body — the OTHER route wants `{ from, to }` (`from` = the primary); the GROUP route `{ to }` alone
 * (a group has ONE primary; the server delegates to the group swap so the seats follow). `fromDate` rides via `withFromDate`.
 */
export const swapBody = (ref: Pick<SeriesRef, "kind">, primary: string, to: string): { from?: string; to: string } =>
  ref.kind === "group" ? { to } : { from: primary, to };

export interface SeriesSeat {
  studentId: string | null;
  status: string;
}
const isLive = (status: string) => status !== "CANCELLED" && status !== "ATTENDED";

/**
 * What cancel-all on a GROUP will cascade to, COUNTED from the DTO (every seat, any status, per row): the live seats on
 * the live rows, and how many distinct students they belong to. 🚫 No cascade logic — the server cancels the seats and
 * tells each family; `householdsTold` (distinct families, TASK-445) is the SERVER's number (the response), never computed here (siblings share one).
 */
export const seatCascade = (rows: readonly (Pick<OtherSeriesRow, "status"> & { seats?: readonly SeriesSeat[] })[]) => {
  const live = rows.filter((r) => isLive(r.status)).flatMap((r) => (r.seats ?? []).filter((s) => isLive(s.status)));
  return { seats: live.length, students: new Set(live.map((s) => s.studentId ?? "")).size };
};

/** Confirm-whole-group acts on the PENDING group rows AND every PENDING seat on a LIVE row (its course confirmed by the server). */
export const pendingSeats = (rows: readonly (Pick<OtherSeriesRow, "status"> & { seats?: readonly SeriesSeat[] })[]): number =>
  rows.filter((r) => isLive(r.status)).reduce((n, r) => n + (r.seats ?? []).filter((s) => s.status === "PENDING").length, 0);

/**
 * The GROUP doors: the OTHER doors with the confirm door widened — a group with every ROW confirmed but a PENDING seat
 * still has something to confirm. `grants.status` is `bookings.course-confirm` here (the modal picks the grant per kind:
 * the group's confirm-all confirms COURSES, so it is the course key, not `calendar.status`). Cancel-all: key 58, a live row.
 */
export const groupSeriesDoors = (grants: SeriesGrants, series: { rows: readonly (OtherSeriesRow & { seats?: readonly SeriesSeat[] })[] } | null | undefined): SeriesDoors => {
  const doors = seriesDoors(grants, series);
  return { ...doors, confirmAll: grants.status && (doors.confirmAll || pendingSeats(series?.rows ?? []) > 0) };
};
