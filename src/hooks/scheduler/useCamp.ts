"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCampWeek,
  getCampDayCheckin,
  getCampPrices,
  getCampWeekDays,
  listCampPackages,
  listCampWeeks,
  markCampDay,
  redeemCampDays,
  sellCampPackage,
  updateCampWeek,
  type CreateCampWeekInput,
  type UpdateCampWeekInput,
} from "@/services/camp.service";
import type { CampDayStatusWrite, CampHalf, SellCampInput } from "@/lib/camp/units";
import { CALENDAR_KEY } from "./useScheduler";

/** REQ-095 Stage 3a (TASK-402) — the Camp menu's data. Every write re-reads the weeks, the roster and the packages; the calendar too (its day banner). */
export const CAMP_KEY = ["camp"] as const;
const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: CAMP_KEY });
  void qc.invalidateQueries({ queryKey: CALENDAR_KEY });
};

export const useCampPrices = (enabled = true) => useQuery({ queryKey: [...CAMP_KEY, "prices"], queryFn: getCampPrices, enabled, staleTime: 5 * 60_000 });
export const useCampWeeks = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: [...CAMP_KEY, "weeks", from, to], queryFn: () => listCampWeeks(from, to), enabled });
export const useCampWeekDays = (id: string | null) =>
  useQuery({ queryKey: [...CAMP_KEY, "week", id], queryFn: () => getCampWeekDays(id as string), enabled: !!id, staleTime: 0 });
export const useCampPackages = (studentId: string | null) =>
  useQuery({ queryKey: [...CAMP_KEY, "packages", studentId], queryFn: () => listCampPackages(studentId as string), enabled: !!studentId, staleTime: 0 });

export const useCreateCampWeek = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateCampWeekInput) => createCampWeek(input), onSuccess: () => invalidate(qc) });
};
export const useUpdateCampWeek = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateCampWeekInput }) => updateCampWeek(id, input), onSuccess: () => invalidate(qc) });
};
export const useSellCamp = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: SellCampInput) => sellCampPackage(input), onSuccess: () => invalidate(qc) });
};
export const useRedeemCamp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ packageId, weekId, dates, half }: { packageId: string; weekId: string; dates: string[]; half: CampHalf }) => redeemCampDays(packageId, weekId, dates, half),
    onSuccess: () => invalidate(qc),
  });
};
/** A mark, or the undo (`status: "PLANNED"` + `reason`) — one route, one hook (TASK-404). */
export const useMarkCampDay = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dayId, status, reason }: { dayId: string; status: CampDayStatusWrite; reason?: string }) => markCampDay(dayId, status, reason),
    onSuccess: () => invalidate(qc),
  });
};
/** The day's check-in QR — fetched only while its dialog is open (`dayId` null ⇒ nothing minted). */
export const useCampDayCheckin = (dayId: string | null) =>
  useQuery({ queryKey: [...CAMP_KEY, "checkin", dayId], queryFn: () => getCampDayCheckin(dayId as string), enabled: !!dayId, staleTime: 60_000 });
