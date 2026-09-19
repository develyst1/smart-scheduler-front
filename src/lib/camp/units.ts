/**
 * REQ-095 Stage 3a / SPEC-082 (TASK-402) — Balance camp, the pure side.
 *
 * ONE currency: a full day = 2 units, a half (AM | PM) = 1 — integers, so credit never becomes 0.5. The server keeps
 * every rule (credit = total − used − planned, capacity, the transitions, closed weeks); this file only READS what it
 * sends (credit in UNITS ⇒ days + a half for the eye) and shapes the confirmed bodies. 🚫 No expiry anywhere: there is
 * none. 🚫 No client rule beyond the shapes.
 */

export const CAMP_KINDS = ["FULL", "HALF"] as const;
export type CampKind = (typeof CAMP_KINDS)[number];
export const CAMP_PLANS = ["FULL_WEEK", "DAILY"] as const;
export type CampPlan = (typeof CAMP_PLANS)[number];
export const CAMP_HALVES = ["AM", "PM", "FULL"] as const;
export type CampHalf = (typeof CAMP_HALVES)[number];
export const CAMP_MARKS = ["ATTENDED", "ABSENT", "CANCELLED"] as const;
export type CampMark = (typeof CAMP_MARKS)[number];

/** Units → whole days + whether a half is left over. `credit` is the server's number; never derived here. */
export const creditDays = (units: number): { days: number; half: boolean } => {
  const u = Math.max(0, Math.floor(units));
  return { days: Math.floor(u / 2), half: u % 2 === 1 };
};

/** `4½` / `4` / `½` / `0` — the number the card prints; the word ("days left") is the dictionary's. */
export const creditLabel = (units: number): string => {
  const { days, half } = creditDays(units);
  if (days === 0 && half) return "½";
  return half ? `${days}½` : String(days);
};

/** Every ISO date from `startDate` to `endDate` inclusive (the week's own list when the server sends one wins). */
export const datesBetween = (startDate: string, endDate: string): string[] => {
  const out: string[] = [];
  const d = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let i = 0; i < 31 && d <= end; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

export interface CampWeekLite {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
  dayCounts: Record<string, number>;
}

/** The OPEN weeks covering a calendar date, each with that day's count — the banner's rows. Pure. */
export const bannerWeeksFor = <W extends CampWeekLite>(weeks: readonly W[] | undefined, date: string): Array<{ week: W; kids: number }> =>
  (weeks ?? [])
    .filter((w) => w.status === "OPEN" && w.startDate <= date && date <= w.endDate)
    .map((w) => ({ week: w, kids: w.dayCounts[date] ?? 0 }));

/** Weeks grouped by their start month (`YYYY-MM`), each group in date order. Pure. */
export const weeksByMonth = <W extends { startDate: string }>(weeks: readonly W[]): Array<{ month: string; weeks: W[] }> => {
  const map = new Map<string, W[]>();
  for (const w of [...weeks].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const m = w.startDate.slice(0, 7);
    map.set(m, [...(map.get(m) ?? []), w]);
  }
  return [...map.entries()].map(([month, ws]) => ({ month, weeks: ws }));
};

/** The sell body — the confirmed shape; `days` only on DAILY, `firstWeek` only when dates were ticked. */
export interface SellCampInput {
  studentId: string;
  kind: CampKind;
  plan: CampPlan;
  days?: number;
  discount?: { kind: string; value: number; reason: string };
  note?: string;
  firstWeek?: { weekId: string; dates: string[]; half: CampHalf };
}
export const sellCampBody = (input: SellCampInput) => ({
  studentId: input.studentId,
  kind: input.kind,
  plan: input.plan,
  ...(input.plan === "DAILY" && typeof input.days === "number" ? { days: input.days } : {}),
  ...(input.discount ? { discount: input.discount } : {}),
  ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  ...(input.firstWeek && input.firstWeek.dates.length > 0 ? { firstWeek: { weekId: input.firstWeek.weekId, dates: [...input.firstWeek.dates].sort(), half: input.firstWeek.half } } : {}),
});

/** The redeem body — `dates` sorted, the half as chosen. */
export const redeemBody = (weekId: string, dates: readonly string[], half: CampHalf) => ({ weekId, dates: [...dates].sort(), half });
