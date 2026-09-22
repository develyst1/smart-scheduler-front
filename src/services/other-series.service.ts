// REQ-101 / SPEC-088 Part A (TASK-428/429) — an ECA/Free/KOL SERIES (`otherSeriesKey`): the read, the range list, and
// the series doors. One tx each on the server; a clash ⇒ `409 SLOT_TAKEN` naming date · hour · teacher (nothing written);
// `409 ALREADY_ON_ROW` / `PRIMARY_TEACHER` / `DATE_EXISTS` are the server's lines. The page refetches only on 2xx.
// REQ-104 §2 (TASK-441/442) — the SAME wire on a DUO/Group series: `SeriesRef.kind` picks the prefix (`seriesPath`),
// the nine `/group-series` routes being the OTHER routes' twins one-for-one. The two shapes that differ: the group's
// primary swap body (`{ to }`, no `from`) and the group header PATCH (no kind field) — pure `swapBody` + the dialog.
import { api, useMockData } from "@/lib/api/client";
import type { OtherSeries, OtherSeriesListItem } from "@/types/api/contract";
import type { EndCourseReason } from "@/types/app/scheduler";
import type { OtherKind } from "@/lib/scheduler/other-schedule";
import { seriesPath, type SeriesRef } from "@/lib/scheduler/other-series";
import * as mock from "./other-series.mock.service";

export const getOtherSeries = async (ref: SeriesRef): Promise<OtherSeries> => {
  if (useMockData) return mock.getOtherSeries(ref);
  const { data } = await api.get<OtherSeries>(seriesPath(ref));
  return data;
};

/** `GET /other-series?from&to` or `GET /group-series?from&to` — one line per key touching the range. */
export const listOtherSeries = async (kind: SeriesRef["kind"], from: string, to: string): Promise<OtherSeriesListItem[]> => {
  if (useMockData) return mock.listOtherSeries(kind, from, to);
  const { data } = await api.get<OtherSeriesListItem[]>(kind === "group" ? "/group-series" : "/other-series", { params: { from, to } });
  return data;
};

export interface ConfirmAllResult {
  confirmed: number;
  skipped: number;
  results: unknown[];
  /** GROUP only (TASK-441): the seated courses confirmed, one `confirmCourse` each; a refused course is a skip, never a throw. */
  courses?: number;
  courseResults?: { courseId: string; outcome: "confirmed" | "skipped"; confirmed?: number; reason?: string }[];
}
export const confirmAllOtherSeries = async (ref: SeriesRef): Promise<ConfirmAllResult> => {
  if (useMockData) return mock.confirmAll(ref);
  const { data } = await api.post<ConfirmAllResult>(seriesPath(ref, "/confirm-all"), {});
  return data;
};

/** Key 58 — `action:calendar.other-cancel-all`; ATTENDED rows stay. A GROUP cascades (TASK-445): the server's `seatsCancelled` · `familyNotices` (one per household per row) · `householdsTold` (distinct families). */
export interface CancelAllResult {
  cancelled: number;
  seatsCancelled?: number;
  familyNotices?: number;
  householdsTold?: number;
}
export const cancelAllOtherSeries = async (ref: SeriesRef, body: { reasonCode: EndCourseReason; note?: string }): Promise<CancelAllResult> => {
  if (useMockData) return mock.cancelAll(ref, body);
  const { data } = await api.post<CancelAllResult>(seriesPath(ref, "/cancel-all"), body);
  return data;
};

export const addOtherSeriesTeacher = async (ref: SeriesRef, body: { teacherId: string; rateMinor?: number; fromDate?: string }): Promise<{ added: number }> => {
  if (useMockData) return mock.addTeacher(ref, body);
  const { data } = await api.post<{ added: number }>(seriesPath(ref, "/teachers"), body);
  return data;
};

export const removeOtherSeriesTeacher = async (ref: SeriesRef, teacherId: string, fromDate?: string): Promise<{ removed: number }> => {
  if (useMockData) return mock.removeTeacher(ref, teacherId);
  const { data } = await api.delete<{ removed: number }>(seriesPath(ref, `/teachers/${teacherId}`), { params: fromDate ? { fromDate } : {} });
  return data;
};

/** OTHER: `from` must be the primary (the server's 400 otherwise). GROUP: `{ to }` alone — `swapBody` builds it. */
export const swapOtherSeriesTeacher = async (ref: SeriesRef, body: { from?: string; to: string; fromDate?: string }): Promise<{ moved: number }> => {
  if (useMockData) return mock.swapTeacher(ref, body);
  const { data } = await api.patch<{ moved: number }>(seriesPath(ref, "/teacher"), body);
  return data;
};

export const addOtherSeriesDates = async (ref: SeriesRef, dates: string[]): Promise<{ created: number; bookingIds: string[] }> => {
  if (useMockData) return mock.addDates(ref, dates);
  const { data } = await api.post<{ created: number; bookingIds: string[] }>(seriesPath(ref, "/dates"), { dates: [...dates].sort() });
  return data;
};

/** The header — no `startTime` (a time change is per-row moves). By presence. A GROUP never carries `otherKind` (its kind is fixed; the server's 400). */
export interface OtherSeriesHeaderPatch {
  title?: string;
  otherKind?: OtherKind;
  headCount?: number | null;
  teacherRates?: Record<string, number>;
}
export const updateOtherSeries = async (ref: SeriesRef, patch: OtherSeriesHeaderPatch): Promise<{ updated: number }> => {
  if (useMockData) return mock.updateHeader(ref, patch);
  const { data } = await api.patch<{ updated: number }>(seriesPath(ref), patch);
  return data;
};
