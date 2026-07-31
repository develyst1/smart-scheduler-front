"use client";

import { useQuery } from "@tanstack/react-query";
import { getAttention } from "@/services/attention.service";

export const ATTENTION_KEY = ["attention"] as const;

export const useAttention = () =>
  useQuery({
    queryKey: ATTENTION_KEY,
    queryFn: getAttention,
    staleTime: 60_000,
  });
