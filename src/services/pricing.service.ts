// Sellable packages — SPEC-024 / TASK-078. The only place the FE learns what is sellable and at what price.
import { api, useMockData } from "@/lib/api/client";
import type { SellablePackagesResponse } from "@/types/app/pricing";
import * as mock from "./pricing.mock.service";

export const getSellablePackages = async (): Promise<SellablePackagesResponse> => {
  if (useMockData) return mock.getSellablePackages();
  const { data } = await api.get<SellablePackagesResponse>("/sellable-packages");
  return data;
};
