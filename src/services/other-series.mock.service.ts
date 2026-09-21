// REQ-101 — offline series. One in-memory series; the doors echo counts. Not a rule engine.
import type { OtherSeries, OtherSeriesListItem } from "@/types/api/contract";
import type { OtherSeriesHeaderPatch } from "./other-series.service";

const delay = <T>(v: T, ms = 100) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const series: OtherSeries = {
  key: "os-1",
  title: "ECA Skate",
  kind: "ECA",
  headCount: 8,
  startTime: "16:00",
  teacherId: "t1",
  additionalTeacherIds: [],
  teacherRates: { t1: 50000 },
  rows: [
    { bookingId: "os-1-a", date: "2026-09-22", status: "PENDING", teacherId: "t1", additionalTeacherIds: [] },
    { bookingId: "os-1-b", date: "2026-09-29", status: "PENDING", teacherId: "t1", additionalTeacherIds: [] },
  ],
};

export const getOtherSeries = (key: string) => delay(clone({ ...series, key }));
export const listOtherSeries = (_from: string, _to: string): Promise<OtherSeriesListItem[]> =>
  delay([{ key: series.key, title: series.title, kind: series.kind, startTime: series.startTime, teacherId: series.teacherId, firstDate: series.rows[0].date, lastDate: series.rows[series.rows.length - 1].date, liveCount: series.rows.length, total: series.rows.length }]);
export const confirmAll = (_key: string) => {
  const n = series.rows.filter((r) => r.status === "PENDING").length;
  for (const r of series.rows) if (r.status === "PENDING") r.status = "CONFIRMED";
  return delay({ confirmed: n, skipped: 0, results: [] });
};
export const cancelAll = (_key: string, _body: unknown) => {
  const live = series.rows.filter((r) => r.status !== "CANCELLED" && r.status !== "ATTENDED");
  for (const r of live) r.status = "CANCELLED";
  return delay({ cancelled: live.length });
};
export const addTeacher = (_key: string, body: { teacherId: string }) => {
  for (const r of series.rows) if (!r.additionalTeacherIds.includes(body.teacherId)) r.additionalTeacherIds.push(body.teacherId);
  series.additionalTeacherIds = [...new Set([...series.additionalTeacherIds, body.teacherId])];
  return delay({ added: series.rows.length });
};
export const removeTeacher = (_key: string, teacherId: string) => {
  for (const r of series.rows) r.additionalTeacherIds = r.additionalTeacherIds.filter((x) => x !== teacherId);
  series.additionalTeacherIds = series.additionalTeacherIds.filter((x) => x !== teacherId);
  return delay({ removed: series.rows.length });
};
export const swapTeacher = (_key: string, body: { from: string; to: string }) => {
  for (const r of series.rows) if (r.teacherId === body.from) r.teacherId = body.to;
  series.teacherId = body.to;
  return delay({ moved: series.rows.length });
};
export const addDates = (_key: string, dates: string[]) => {
  for (const d of dates) series.rows.push({ bookingId: `os-1-${d}`, date: d, status: "PENDING", teacherId: series.teacherId, additionalTeacherIds: [...series.additionalTeacherIds] });
  series.rows.sort((a, b) => a.date.localeCompare(b.date));
  return delay({ created: dates.length, bookingIds: dates.map((d) => `os-1-${d}`) });
};
export const updateHeader = (_key: string, patch: OtherSeriesHeaderPatch) => {
  if (patch.title !== undefined) series.title = patch.title;
  if (patch.otherKind !== undefined) series.kind = patch.otherKind;
  if (patch.headCount !== undefined) series.headCount = patch.headCount;
  if (patch.teacherRates !== undefined) series.teacherRates = patch.teacherRates;
  return delay({ updated: series.rows.length });
};
