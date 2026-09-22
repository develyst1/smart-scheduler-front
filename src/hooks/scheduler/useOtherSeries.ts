"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addOtherSeriesDates,
  addOtherSeriesTeacher,
  cancelAllOtherSeries,
  confirmAllOtherSeries,
  getOtherSeries,
  listOtherSeries,
  removeOtherSeriesTeacher,
  swapOtherSeriesTeacher,
  updateOtherSeries,
  type OtherSeriesHeaderPatch,
} from "@/services/other-series.service";
import type { EndCourseReason } from "@/types/app/scheduler";
import type { SeriesRef } from "@/lib/scheduler/other-series";
import { BOOKINGS_KEY, CALENDAR_KEY } from "./useScheduler";

/** REQ-101 (TASK-429) — the Manage-plan page's data. Every door re-reads the series, the calendar and the bookings (on 2xx only — a 409 wrote nothing). */
export const OTHER_SERIES_KEY = ["other-series"] as const;
const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: OTHER_SERIES_KEY });
  void qc.invalidateQueries({ queryKey: CALENDAR_KEY });
  void qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
};

// REQ-104 (TASK-442) — the ref's kind picks the wire (`/other-series` | `/group-series`); the key space is per kind.
export const useOtherSeries = (ref: SeriesRef | null) =>
  useQuery({ queryKey: [...OTHER_SERIES_KEY, ref?.kind, ref?.key], queryFn: () => getOtherSeries(ref as SeriesRef), enabled: !!ref, staleTime: 0 });
export const useOtherSeriesList = (kind: SeriesRef["kind"], from: string, to: string, enabled = true) =>
  useQuery({ queryKey: [...OTHER_SERIES_KEY, "range", kind, from, to], queryFn: () => listOtherSeries(kind, from, to), enabled });

const door = <TVars, TRes>(fn: (v: TVars) => Promise<TRes>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate(qc) });
};
export const useConfirmAllOtherSeries = () => door((ref: SeriesRef) => confirmAllOtherSeries(ref));
export const useCancelAllOtherSeries = () => door(({ ref, body }: { ref: SeriesRef; body: { reasonCode: EndCourseReason; note?: string } }) => cancelAllOtherSeries(ref, body));
export const useAddOtherSeriesTeacher = () => door(({ ref, body }: { ref: SeriesRef; body: { teacherId: string; rateMinor?: number; fromDate?: string } }) => addOtherSeriesTeacher(ref, body));
export const useRemoveOtherSeriesTeacher = () => door(({ ref, teacherId, fromDate }: { ref: SeriesRef; teacherId: string; fromDate?: string }) => removeOtherSeriesTeacher(ref, teacherId, fromDate));
export const useSwapOtherSeriesTeacher = () => door(({ ref, body }: { ref: SeriesRef; body: { from?: string; to: string; fromDate?: string } }) => swapOtherSeriesTeacher(ref, body));
export const useAddOtherSeriesDates = () => door(({ ref, dates }: { ref: SeriesRef; dates: string[] }) => addOtherSeriesDates(ref, dates));
export const useUpdateOtherSeries = () => door(({ ref, patch }: { ref: SeriesRef; patch: OtherSeriesHeaderPatch }) => updateOtherSeries(ref, patch));
