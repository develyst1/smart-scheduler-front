// REQ-101 / SPEC-088 Part A (TASK-428/429) — an ECA/Free/KOL SERIES (`otherSeriesKey`): the read, the range list, and
// the series doors. One tx each on the server; a clash ⇒ `409 SLOT_TAKEN` naming date · hour · teacher (nothing written);
// `409 ALREADY_ON_ROW` / `PRIMARY_TEACHER` / `DATE_EXISTS` are the server's lines. The page refetches only on 2xx.
import { api, useMockData } from "@/lib/api/client";
import type { OtherSeries, OtherSeriesListItem } from "@/types/api/contract";
import type { EndCourseReason } from "@/types/app/scheduler";
import type { OtherKind } from "@/lib/scheduler/other-schedule";
import * as mock from "./other-series.mock.service";

export const getOtherSeries = async (key: string): Promise<OtherSeries> => {
  if (useMockData) return mock.getOtherSeries(key);
  const { data } = await api.get<OtherSeries>(`/other-series/${encodeURIComponent(key)}`);
  return data;
};

export const listOtherSeries = async (from: string, to: string): Promise<OtherSeriesListItem[]> => {
  if (useMockData) return mock.listOtherSeries(from, to);
  const { data } = await api.get<OtherSeriesListItem[]>("/other-series", { params: { from, to } });
  return data;
};

export interface ConfirmAllResult {
  confirmed: number;
  skipped: number;
  results: unknown[];
}
export const confirmAllOtherSeries = async (key: string): Promise<ConfirmAllResult> => {
  if (useMockData) return mock.confirmAll(key);
  const { data } = await api.post<ConfirmAllResult>(`/other-series/${encodeURIComponent(key)}/confirm-all`, {});
  return data;
};

/** Key 58 — `action:calendar.other-cancel-all`; ATTENDED rows stay. */
export const cancelAllOtherSeries = async (key: string, body: { reasonCode: EndCourseReason; note?: string }): Promise<{ cancelled: number }> => {
  if (useMockData) return mock.cancelAll(key, body);
  const { data } = await api.post<{ cancelled: number }>(`/other-series/${encodeURIComponent(key)}/cancel-all`, body);
  return data;
};

export const addOtherSeriesTeacher = async (key: string, body: { teacherId: string; rateMinor?: number; fromDate?: string }): Promise<{ added: number }> => {
  if (useMockData) return mock.addTeacher(key, body);
  const { data } = await api.post<{ added: number }>(`/other-series/${encodeURIComponent(key)}/teachers`, body);
  return data;
};

export const removeOtherSeriesTeacher = async (key: string, teacherId: string, fromDate?: string): Promise<{ removed: number }> => {
  if (useMockData) return mock.removeTeacher(key, teacherId);
  const { data } = await api.delete<{ removed: number }>(`/other-series/${encodeURIComponent(key)}/teachers/${teacherId}`, { params: fromDate ? { fromDate } : {} });
  return data;
};

/** `from` must be the primary (the server's 400 otherwise). */
export const swapOtherSeriesTeacher = async (key: string, body: { from: string; to: string; fromDate?: string }): Promise<{ moved: number }> => {
  if (useMockData) return mock.swapTeacher(key, body);
  const { data } = await api.patch<{ moved: number }>(`/other-series/${encodeURIComponent(key)}/teacher`, body);
  return data;
};

export const addOtherSeriesDates = async (key: string, dates: string[]): Promise<{ created: number; bookingIds: string[] }> => {
  if (useMockData) return mock.addDates(key, dates);
  const { data } = await api.post<{ created: number; bookingIds: string[] }>(`/other-series/${encodeURIComponent(key)}/dates`, { dates: [...dates].sort() });
  return data;
};

/** The header — no `startTime` (a time change is per-row moves). By presence. */
export interface OtherSeriesHeaderPatch {
  title?: string;
  otherKind?: OtherKind;
  headCount?: number | null;
  teacherRates?: Record<string, number>;
}
export const updateOtherSeries = async (key: string, patch: OtherSeriesHeaderPatch): Promise<{ updated: number }> => {
  if (useMockData) return mock.updateHeader(key, patch);
  const { data } = await api.patch<{ updated: number }>(`/other-series/${encodeURIComponent(key)}`, patch);
  return data;
};
