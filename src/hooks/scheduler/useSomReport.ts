"use client";

import { useQuery } from "@tanstack/react-query";
import { getSomReport } from "@/services/som-report.service";

export const SOM_REPORT_KEY = ["som-report"] as const;

export const useSomReport = () =>
  useQuery({
    queryKey: SOM_REPORT_KEY,
    queryFn: getSomReport,
    staleTime: 60_000,
  });
