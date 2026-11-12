"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { closeDays, getClosedDays, reopenDay } from "@/services/closed-day.service";
import { ATTENTION_KEY } from "./useAttention";

/**
 * 🔴 **TASK-960 (SPEC-105 §3) — the closed days over exactly the dates on screen.** 🚫 `enabled` is the gate, not a try/catch: the route refuses a LINKED teacher (403), so a
 * teacher-scoped session must never ASK (the same rule as `useLeaveDays`). Its own key family, `["closed-days", …]`.
 */
export const useClosedDays = (from: string, to: string, enabled: boolean) =>
  useQuery({
    queryKey: ["closed-days", from, to],
    queryFn: () => getClosedDays(from, to),
    enabled: Boolean(enabled && from && to),
    staleTime: 60_000,
  });

/** Closing or re-opening a day changes the strip and the Attention card (the classes on a closed day are listed there) — never a booking, so the calendar read is left alone. */
const refresh = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["closed-days"] });
  qc.invalidateQueries({ queryKey: ATTENTION_KEY });
};

export const useCloseDays = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: closeDays, onSuccess: () => refresh(qc) });
};

export const useReopenDay = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: reopenDay, onSuccess: () => refresh(qc) });
};
