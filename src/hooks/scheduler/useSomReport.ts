"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getNvrDetail, getSomReport } from "@/services/som-report.service";
import type { NvrBucket, SomQuery } from "@/types/app/som";

export const SOM_REPORT_KEY = ["som-report"] as const;
export const NVR_DETAIL_KEY = ["som-report", "nvr-detail"] as const;

const queryKeyOf = (q: SomQuery) => [q.month, [...q.badgeValueIds].sort().join(",")] as const;

/** The whole dashboard for one month + branch selection. Keeps the last result on screen while a new filter loads. */
export const useSomReport = (q: SomQuery) =>
  useQuery({
    queryKey: [...SOM_REPORT_KEY, ...queryKeyOf(q)],
    queryFn: () => getSomReport(q),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

/** Rows behind one New-vs-Renewing card; idle until a card is opened. */
export const useNvrDetail = (bucket: NvrBucket | null, q: SomQuery) =>
  useQuery({
    queryKey: [...NVR_DETAIL_KEY, bucket, ...queryKeyOf(q)],
    queryFn: () => getNvrDetail(bucket!, q),
    enabled: bucket !== null,
    staleTime: 60_000,
    // A missing endpoint should fall straight to the empty table, not spin through retries.
    retry: false,
  });
