"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBadgeType,
  createBadgeValue,
  getBadgeReport,
  getBadges,
  setBookingBadges,
  updateBadgeType,
  updateBadgeValue,
} from "@/services/badge.service";
import { BOOKINGS_KEY, CALENDAR_KEY } from "./useScheduler";

export const BADGES_KEY = ["badges"] as const;

export const useBadges = (includeInactive = false) =>
  useQuery({
    queryKey: [...BADGES_KEY, includeInactive],
    queryFn: () => getBadges(includeInactive),
  });

export const useBadgeReport = (from: string, to: string) =>
  useQuery({
    queryKey: [...BADGES_KEY, "report", from, to],
    queryFn: () => getBadgeReport(from, to),
  });

const invalidateBadgeAdmin = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: BADGES_KEY });

export const useCreateBadgeType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; sortOrder?: number }) => createBadgeType(input),
    onSuccess: () => invalidateBadgeAdmin(qc),
  });
};

export const useUpdateBadgeType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      patch: Partial<{ name: string; active: boolean; sortOrder: number }>;
    }) => updateBadgeType(vars.id, vars.patch),
    onSuccess: () => invalidateBadgeAdmin(qc),
  });
};

export const useCreateBadgeValue = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      badgeTypeId: string;
      label: string;
      color: string;
      sortOrder?: number;
    }) => createBadgeValue(input),
    onSuccess: () => invalidateBadgeAdmin(qc),
  });
};

export const useUpdateBadgeValue = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      patch: Partial<{ label: string; color: string; active: boolean; sortOrder: number }>;
    }) => updateBadgeValue(vars.id, vars.patch),
    onSuccess: () => invalidateBadgeAdmin(qc),
  });
};

/** Setting a booking's badges changes the chips shown on the calendar/bookings. */
export const useSetBookingBadges = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { bookingId: string; badgeValueIds: string[] }) =>
      setBookingBadges(vars.bookingId, vars.badgeValueIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CALENDAR_KEY });
      qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
    },
  });
};
