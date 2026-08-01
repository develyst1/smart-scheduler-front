import { api, useMockData } from "@/lib/api/client";
import { SOM_UNKNOWN_KEY, type SomReport } from "@/types/app/som";

// Offline mock — deliberately a "just after launch" snapshot: demographics are MOSTLY unknown, so the
// coverage line ("based on X of Y") and the unknown bucket are exercised, not just a clean pie.
const mockSom = (): SomReport => {
  const bd = (buckets: { key: string; label?: string | null; count: number }[], total: number) => {
    const unknown = buckets.find((b) => b.key === SOM_UNKNOWN_KEY)?.count ?? 0;
    return { buckets, known: total - unknown, unknown, total };
  };
  return {
    existingCustomers: {
      byCourse: 12,
      byVoucher: 7,
      byRecentTrial: 5,
      total: 20,
      recentTrialSince: "2026-05-01",
    },
    sportShare: bd(
      [
        { key: "surf", label: "Surfskate", count: 9 },
        { key: "scooter", label: "Scooter", count: 5 },
        { key: "bike", label: "Balance bike", count: 3 },
        { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 3 },
      ],
      20,
    ),
    newVsRenewing: { month: "2026-08", newByFirstTrial: 4, newByRegistration: 3, renewing: 2 },
    demographics: {
      gender: bd(
        [
          { key: "male", count: 3 },
          { key: "female", count: 2 },
          { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 15 },
        ],
        20,
      ),
      ageBand: bd(
        [
          { key: "6-9", count: 2 },
          { key: "10-12", count: 1 },
          { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 17 },
        ],
        20,
      ),
      province: bd(
        [
          { key: "กรุงเทพมหานคร", count: 4 },
          { key: "ภูเก็ต", count: 1 },
          { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 15 },
        ],
        20,
      ),
      nationality: bd(
        [
          { key: "ไทย", count: 5 },
          { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 15 },
        ],
        20,
      ),
    },
    today: { date: "2026-08-01", expected: 18, attended: 11 },
    generatedAt: "2026-08-01T09:15:00.000Z",
  };
};

/** REQ-013: the whole SOM dashboard from one snapshot. The FE renders it as-is. */
export const getSomReport = async (): Promise<SomReport> => {
  if (useMockData) return mockSom();
  const { data } = await api.get<SomReport>("/reports/som");
  return data;
};
