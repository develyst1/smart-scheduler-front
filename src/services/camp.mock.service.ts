// REQ-095 Stage 3a — offline camp. In-memory rows; the same shapes as the real service. The mock is not a rule engine:
// it plans what it is asked and echoes the units arithmetic only so the card renders.
import type { CampDayEntry, CampPackage, CampPrices, CampWeek, CampWeekDays } from "@/types/api/contract";
import { datesBetween, type CampHalf, type CampMark, type SellCampInput } from "@/lib/camp/units";
import type { CreateCampWeekInput, UpdateCampWeekInput } from "./camp.service";

const delay = <T>(v: T, ms = 100) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const weeks: CampWeek[] = [];
const packages: CampPackage[] = [];
let seq = 1;

export const getCampPrices = () =>
  delay<CampPrices>({
    items: [
      { externalRef: "camp-full-week", kind: "FULL", plan: "FULL_WEEK", priceMinor: 1150000 },
      { externalRef: "camp-half-week", kind: "HALF", plan: "FULL_WEEK", priceMinor: 590000 },
      { externalRef: "camp-full-day", kind: "FULL", plan: "DAILY", priceMinor: 260000 },
      { externalRef: "camp-half-day", kind: "HALF", plan: "DAILY", priceMinor: 130000 },
    ],
  });

export const listCampWeeks = (from: string, to: string) => delay(clone(weeks.filter((w) => w.endDate >= from && w.startDate <= to)));

export const createCampWeek = (input: CreateCampWeekInput) => {
  const now = new Date().toISOString();
  const w: CampWeek = {
    id: `w-${seq++}`,
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    capacity: input.capacity ?? null,
    teacherIds: input.teacherIds ?? [],
    status: "OPEN",
    openedBy: "mock",
    openedAt: now,
    closedAt: null,
    dates: datesBetween(input.startDate, input.endDate),
    dayCounts: {},
  };
  weeks.push(w);
  return delay(clone(w));
};

export const updateCampWeek = (id: string, input: UpdateCampWeekInput) => {
  const w = weeks.find((x) => x.id === id)!;
  if (input.name !== undefined) w.name = input.name.trim();
  if (input.capacity !== undefined) w.capacity = input.capacity;
  if (input.teacherIds !== undefined) w.teacherIds = input.teacherIds;
  if (input.status !== undefined) w.status = input.status;
  return delay(clone(w));
};

export const getCampWeekDays = (id: string) => {
  const w = weeks.find((x) => x.id === id)!;
  const days = w.dates.map((date) => {
    const entries: CampDayEntry[] = packages.flatMap((p) =>
      p.days.filter((d) => d.weekId === id && d.date === date).map((d) => ({ dayId: d.dayId, packageId: p.id, studentId: p.studentId, studentName: `student ${p.studentId}`, kind: p.kind, half: d.half, units: d.units, status: d.status })),
    );
    return { date, entries, count: entries.filter((e) => e.status !== "CANCELLED").length, capacity: w.capacity };
  });
  return delay<CampWeekDays>(clone({ week: w, days }));
};

export const listCampPackages = (studentId: string) => delay(clone(packages.filter((p) => p.studentId === studentId)));

const recompute = (p: CampPackage) => {
  p.usedUnits = p.days.filter((d) => d.status === "ATTENDED" || d.status === "ABSENT").reduce((s, d) => s + d.units, 0);
  p.plannedUnits = p.days.filter((d) => d.status === "PLANNED").reduce((s, d) => s + d.units, 0);
  p.credit = p.totalUnits - p.usedUnits - p.plannedUnits;
};

export const sellCampPackage = async (input: SellCampInput) => {
  const perDay = input.kind === "FULL" ? 2 : 1;
  const days = input.plan === "FULL_WEEK" ? 5 : (input.days ?? 1);
  const p: CampPackage = {
    id: `cp-${seq++}`,
    studentId: input.studentId,
    kind: input.kind,
    plan: input.plan,
    totalUnits: perDay * days,
    usedUnits: 0,
    plannedUnits: 0,
    credit: perDay * days,
    saleId: `sale-${seq}`,
    note: input.note ?? null,
    discount: input.discount ? { ...input.discount, actor: "mock" } : null,
    days: [],
    createdBy: "mock",
    createdAt: new Date().toISOString(),
  };
  packages.push(p);
  let planned = 0;
  if (input.firstWeek) planned = (await redeemCampDays(p.id, input.firstWeek.weekId, input.firstWeek.dates, input.firstWeek.half)).planned as number;
  return delay({ package: clone(p), planned });
};

export const redeemCampDays = (packageId: string, weekId: string, dates: string[], half: CampHalf) => {
  const p = packages.find((x) => x.id === packageId)!;
  const w = weeks.find((x) => x.id === weekId);
  for (const date of dates) {
    p.days.push({ dayId: `d-${seq++}`, weekId, weekName: w?.name ?? weekId, date, half, units: half === "FULL" ? 2 : 1, status: "PLANNED" });
    if (w) w.dayCounts[date] = (w.dayCounts[date] ?? 0) + 1;
  }
  recompute(p);
  return delay({ planned: dates.length, package: clone(p) });
};

export const markCampDay = (dayId: string, status: CampMark) => {
  const p = packages.find((x) => x.days.some((d) => d.dayId === dayId))!;
  const d = p.days.find((x) => x.dayId === dayId)!;
  d.status = status;
  recompute(p);
  return delay(clone(p));
};
