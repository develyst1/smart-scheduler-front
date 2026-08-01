// SOM dashboard (REQ-013 / SPEC-020). One snapshot from GET /api/reports/som; the FE renders it as-is —
// no recomputation, no re-bucketing, no age derivation (all server-side so every surface agrees).

/** Stable key for the "unknown / ไม่ระบุ" bucket — the FE labels it from its own dictionary (API supplies identity). */
export const SOM_UNKNOWN_KEY = "unknown";

export interface BreakdownBucket {
  key: string;
  /** API label where it supplies one (e.g. a sport name); absent for keys the FE labels itself. */
  label?: string | null;
  count: number;
}

/** Every breakdown carries its own coverage so the FE can say "based on X of Y". */
export interface Breakdown {
  buckets: BreakdownBucket[];
  known: number;
  unknown: number;
  total: number;
}

export interface ExistingCustomers {
  byCourse: number;
  byVoucher: number;
  byRecentTrial: number;
  total: number;
  recentTrialSince: string; // YYYY-MM-DD
}

export interface NewVsRenewing {
  month: string; // YYYY-MM
  newByFirstTrial: number;
  newByRegistration: number;
  renewing: number;
}

export interface TodaySection {
  date: string; // YYYY-MM-DD
  expected: number;
  attended: number;
}

export interface SomReport {
  existingCustomers: ExistingCustomers;
  sportShare: Breakdown;
  newVsRenewing: NewVsRenewing;
  demographics: {
    gender: Breakdown;
    ageBand: Breakdown;
    province: Breakdown;
    nationality: Breakdown;
  };
  today: TodaySection;
  generatedAt: string; // ISO
}
