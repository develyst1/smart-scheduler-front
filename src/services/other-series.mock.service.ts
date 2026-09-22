// REQ-101 — offline series. One in-memory series; the doors echo counts. Not a rule engine.
import type { OtherSeries, OtherSeriesListItem } from "@/types/api/contract";
import type { OtherSeriesHeaderPatch } from "./other-series.service";
import type { SeriesRef } from "@/lib/scheduler/other-series";

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

// REQ-104 (TASK-442) — one GROUP series with seats, so the group face is exercisable offline.
const group: OtherSeries = {
  key: "gs-1",
  title: "Group Skate B",
  kind: "GROUP",
  headCount: 4,
  startTime: "17:00",
  teacherId: "t1",
  additionalTeacherIds: [],
  teacherRates: { t1: 60000 },
  rows: [
    { bookingId: "gs-1-a", date: "2026-09-23", status: "PENDING", teacherId: "t1", additionalTeacherIds: [], seats: [{ bookingId: "seat-1", studentId: "s1", displayName: "มิ้น", status: "PENDING" }, { bookingId: "seat-2", studentId: "s2", displayName: "เอิร์ธ", status: "CANCELLED" }] },
    { bookingId: "gs-1-b", date: "2026-09-30", status: "PENDING", teacherId: "t1", additionalTeacherIds: [], seats: [{ bookingId: "seat-3", studentId: "s1", displayName: "มิ้น", status: "PENDING" }] },
  ],
};
const of = (ref: SeriesRef) => (ref.kind === "group" ? group : series);
const isLive = (s: string) => s !== "CANCELLED" && s !== "ATTENDED";
const line = (s: OtherSeries): OtherSeriesListItem => ({ key: s.key, title: s.title, kind: s.kind, startTime: s.startTime, teacherId: s.teacherId, firstDate: s.rows[0].date, lastDate: s.rows[s.rows.length - 1].date, liveCount: s.rows.filter((r) => isLive(r.status)).length, total: s.rows.length });

export const getOtherSeries = (ref: SeriesRef) => delay(clone({ ...of(ref), key: ref.key }));
export const listOtherSeries = (kind: SeriesRef["kind"], _from: string, _to: string): Promise<OtherSeriesListItem[]> => delay([line(kind === "group" ? group : series)]);
export const confirmAll = (ref: SeriesRef) => {
  const s = of(ref);
  const n = s.rows.filter((r) => r.status === "PENDING").length;
  for (const r of s.rows) if (r.status === "PENDING") r.status = "CONFIRMED";
  let courses = 0;
  for (const r of s.rows) for (const seat of r.seats ?? []) if (seat.status === "PENDING") { seat.status = "CONFIRMED"; courses += 1; }
  return delay(ref.kind === "group" ? { confirmed: n, skipped: 0, results: [], courses, courseResults: [] } : { confirmed: n, skipped: 0, results: [] });
};
export const cancelAll = (ref: SeriesRef, _body: unknown) => {
  const s = of(ref);
  const live = s.rows.filter((r) => isLive(r.status));
  let seats = 0;
  const families = new Set<string>();
  for (const r of live) {
    r.status = "CANCELLED";
    for (const seat of r.seats ?? []) if (isLive(seat.status)) { seat.status = "CANCELLED"; seats += 1; families.add(seat.studentId ?? ""); }
  }
  return delay(ref.kind === "group" ? { cancelled: live.length, seatsCancelled: seats, familyNotices: seats, householdsTold: families.size } : { cancelled: live.length });
};
export const addTeacher = (ref: SeriesRef, body: { teacherId: string }) => {
  const s = of(ref);
  for (const r of s.rows) if (!r.additionalTeacherIds.includes(body.teacherId)) r.additionalTeacherIds.push(body.teacherId);
  s.additionalTeacherIds = [...new Set([...s.additionalTeacherIds, body.teacherId])];
  return delay({ added: s.rows.length });
};
export const removeTeacher = (ref: SeriesRef, teacherId: string) => {
  const s = of(ref);
  for (const r of s.rows) r.additionalTeacherIds = r.additionalTeacherIds.filter((x) => x !== teacherId);
  s.additionalTeacherIds = s.additionalTeacherIds.filter((x) => x !== teacherId);
  return delay({ removed: s.rows.length });
};
export const swapTeacher = (ref: SeriesRef, body: { from?: string; to: string }) => {
  const s = of(ref);
  const from = body.from ?? s.teacherId;
  for (const r of s.rows) if (r.teacherId === from) r.teacherId = body.to;
  s.teacherId = body.to;
  return delay({ moved: s.rows.length });
};
export const addDates = (ref: SeriesRef, dates: string[]) => {
  const s = of(ref);
  for (const d of dates) s.rows.push({ bookingId: `${s.key}-${d}`, date: d, status: "PENDING", teacherId: s.teacherId, additionalTeacherIds: [...s.additionalTeacherIds], ...(ref.kind === "group" ? { seats: [] } : {}) });
  s.rows.sort((a, b) => a.date.localeCompare(b.date));
  return delay({ created: dates.length, bookingIds: dates.map((d) => `${s.key}-${d}`) });
};
export const updateHeader = (ref: SeriesRef, patch: OtherSeriesHeaderPatch) => {
  const s = of(ref);
  if (patch.title !== undefined) s.title = patch.title;
  if (patch.otherKind !== undefined && ref.kind !== "group") s.kind = patch.otherKind;
  if (patch.headCount !== undefined) s.headCount = patch.headCount;
  if (patch.teacherRates !== undefined) s.teacherRates = patch.teacherRates;
  return delay({ updated: s.rows.length });
};
