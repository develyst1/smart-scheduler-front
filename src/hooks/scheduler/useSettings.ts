"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSetting, resetSetting } from "@/services/settings.service";

export const SETTINGS_KEY = ["settings"] as const;

/** The configurable business rules (SPEC-029 / REQ-031). Changes rarely; cached for the session. */
export const useSettings = () =>
  useQuery({ queryKey: SETTINGS_KEY, queryFn: getSettings, staleTime: 60_000 });

/** Set an override. A rejected value bubbles as an error the caller surfaces (never silently accepted). */
export const useUpdateSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: number | string }) => updateSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
};

/** Clear an override → back to the coded default (TASK-122 DELETE). */
export const useResetSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => resetSetting(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
};
