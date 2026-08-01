"use client";

import { useQuery } from "@tanstack/react-query";
import { getSellablePackages } from "@/services/pricing.service";

export const SELLABLE_PACKAGES_KEY = ["sellable-packages"] as const;

/** The price card changes rarely and every modal needs it — cache it for the session. */
export const useSellablePackages = () =>
  useQuery({ queryKey: SELLABLE_PACKAGES_KEY, queryFn: getSellablePackages, staleTime: 5 * 60_000 });
