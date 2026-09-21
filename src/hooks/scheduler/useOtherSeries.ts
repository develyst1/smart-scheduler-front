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
import { BOOKINGS_KEY, CALENDAR_KEY } from "./useScheduler";

/** REQ-101 (TASK-429) — the Manage-plan page's data. Every door re-reads the series, the calendar and the bookings (on 2xx only — a 409 wrote nothing). */
export const OTHER_SERIES_KEY = ["other-series"] as const;
const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: OTHER_SERIES_KEY });
  void qc.invalidateQueries({ queryKey: CALENDAR_KEY });
  void qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
};

export const useOtherSeries = (key: string | null) =>
  useQuery({ queryKey: [...OTHER_SERIES_KEY, key], queryFn: () => getOtherSeries(key as string), enabled: !!key, staleTime: 0 });
export const useOtherSeriesList = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: [...OTHER_SERIES_KEY, "range", from, to], queryFn: () => listOtherSeries(from, to), enabled });

const door = <TVars, TRes>(fn: (v: TVars) => Promise<TRes>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate(qc) });
};
export const useConfirmAllOtherSeries = () => door((key: string) => confirmAllOtherSeries(key));
export const useCancelAllOtherSeries = () => door(({ key, body }: { key: string; body: { reasonCode: EndCourseReason; note?: string } }) => cancelAllOtherSeries(key, body));
export const useAddOtherSeriesTeacher = () => door(({ key, body }: { key: string; body: { teacherId: string; rateMinor?: number; fromDate?: string } }) => addOtherSeriesTeacher(key, body));
export const useRemoveOtherSeriesTeacher = () => door(({ key, teacherId, fromDate }: { key: string; teacherId: string; fromDate?: string }) => removeOtherSeriesTeacher(key, teacherId, fromDate));
export const useSwapOtherSeriesTeacher = () => door(({ key, body }: { key: string; body: { from: string; to: string; fromDate?: string } }) => swapOtherSeriesTeacher(key, body));
export const useAddOtherSeriesDates = () => door(({ key, dates }: { key: string; dates: string[] }) => addOtherSeriesDates(key, dates));
export const useUpdateOtherSeries = () => door(({ key, patch }: { key: string; patch: OtherSeriesHeaderPatch }) => updateOtherSeries(key, patch));
