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

/**
 * REQ-104 §2 item 5a (TASK-443/444) — the scan page's ONE `Remaining` line, from the response, no arithmetic: a camp scan
 * prints `credit.remainingDays/totalDays days` (`3.5` as sent); a session scan prints `remaining.used/total` in its unit
 * (a course's sessions, a voucher's hours) — `null` (a trial/single) ⇒ no line; an older payload without the field ⇒ no line.
 * Nothing on `already` (the caller's rule: the line rides a fresh check-in only).
 */
export const remainingLine = (
  r: { kind: "camp"; credit?: { remainingDays: number; totalDays: number } | null } | { kind: "session"; remaining?: { used: number; total: number; unit: "sessions" | "hours" } | null },
): { key: string; args: Record<string, number> } | null => {
  if (r.kind === "camp") return r.credit ? { key: "checkin.remainingDays", args: { remaining: r.credit.remainingDays, total: r.credit.totalDays } } : null;
  if (!r.remaining) return null;
  return { key: r.remaining.unit === "hours" ? "checkin.remainingHours" : "checkin.remainingSessions", args: { used: r.remaining.used, total: r.remaining.total } };
};

/**
 * TASK-450b — is this an id the server can look up? A camp week/day id is a uuid; anything else must never reach a
 * route, because a bad id was answered by Postgres (`22P02`) before TASK-450 made it a 400. `!!id` is not the guard:
 * a real `undefined` is blocked by it, but the four-letter STRING `"undefined"` is truthy and sails through.
 */
export const isUuid = (id: unknown): boolean => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

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

// ── REQ-095 Stage 3b (TASK-403/404) — the UNDO and the day's check-in ─────────────────────────────────────────────
/** The two statuses an undo may leave — back to PLANNED. The server refuses the rest with `CAMP_DAY_TRANSITION`. */
export const CAMP_UNDO_FROM = ["ATTENDED", "ABSENT"] as const;
export const canUndoCampDay = (status: string): boolean => (CAMP_UNDO_FROM as readonly string[]).includes(status);

/** A mark's status, or `PLANNED` — the undo. */
export type CampDayStatusWrite = CampMark | "PLANNED";

/**
 * The body of `PATCH /camp/days/:id`. 🔴 `reason` rides ONLY on the undo (`status: "PLANNED"`): a mark WITH a reason
 * is the server's `400`, an undo WITHOUT one too (3..200 — the server's bounds, shown as its sentence).
 */
export const markBody = (status: CampDayStatusWrite, reason?: string): { status: CampDayStatusWrite; reason?: string } =>
  status === "PLANNED" ? { status, reason: (reason ?? "").trim() } : { status };

/** The public check-in page serves two token kinds; the URL PATH says which, never the token. */
export type CheckinKind = "session" | "camp";
export const checkinEndpointFor = (kind: CheckinKind): "/checkin" | "/checkin/camp" => (kind === "camp" ? "/checkin/camp" : "/checkin");
/** The camp token's own refusal — the clock icon, not the cross (the session's page keeps its 400 sentence match). */
export const CAMP_TOKEN_EXPIRED = "CAMP_TOKEN_EXPIRED";
