// REQ-095 Stage 3a / SPEC-082 (TASK-401/402) — Balance camp: weeks (open · edit · close), the per-day roster, packages
// (sell · redeem · mark). Every rule is the server's: capacity, credit (units), the day transitions, a closed week, a
// date outside the week — refused with named codes whose Thai sentence names the DATE (`CAMP_FULL`, `CAMP_NO_CREDIT`,
// `CAMP_DAY_TAKEN`, `CAMP_WEEK_CLOSED`, `CAMP_DAY_STARTED`, `CAMP_DAY_TRANSITION`, `STUDENT_ARCHIVED`); the dialogs
// show the sentence and keep what was typed. Prices come from `GET /camp/prices` — never a constant here.
import { api, useMockData } from "@/lib/api/client";
import { markBody, redeemBody, sellCampBody, type CampDayStatusWrite, type CampHalf, type SellCampInput } from "@/lib/camp/units";
import type { CampDayCheckin, CampDayEntry, CampPackage, CampPrices, CampWeek, CampWeekDayResult, CampWeekDays } from "@/types/api/contract";
import type { CampDayPatch } from "@/lib/camp/grid";
import * as mock from "./camp.mock.service";

export const getCampPrices = async (): Promise<CampPrices> => {
  if (useMockData) return mock.getCampPrices();
  const { data } = await api.get<CampPrices>("/camp/prices");
  return data;
};

export const listCampWeeks = async (from: string, to: string): Promise<CampWeek[]> => {
  if (useMockData) return mock.listCampWeeks(from, to);
  const { data } = await api.get<{ weeks: CampWeek[] }>("/camp/weeks", { params: { from, to } });
  return data.weeks;
};

export interface CreateCampWeekInput {
  name: string;
  startDate: string;
  endDate: string;
  capacity?: number | null;
  teacherIds?: string[];
  /** TASK-418 — the week's default window (`HH:MM`, whole hours); absent ⇒ the server's 10:00 / 15:00. */
  windowStart?: string;
  windowEnd?: string;
}
export const createCampWeek = async (input: CreateCampWeekInput): Promise<CampWeek> => {
  if (useMockData) return mock.createCampWeek(input);
  const { data } = await api.post<{ week: CampWeek }>("/camp/weeks", {
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    ...(input.teacherIds?.length ? { teacherIds: input.teacherIds } : {}),
    ...(input.windowStart ? { windowStart: input.windowStart } : {}),
    ...(input.windowEnd ? { windowEnd: input.windowEnd } : {}),
  });
  return data.week;
};

export interface UpdateCampWeekInput {
  name?: string;
  capacity?: number | null;
  teacherIds?: string[];
  status?: "OPEN" | "CLOSED";
  /** TASK-418 — a week-level window change re-derives only the days not edited by hand (the server's rule). */
  windowStart?: string;
  windowEnd?: string;
}
/** By presence — only what changed rides. */
export const updateCampWeek = async (id: string, input: UpdateCampWeekInput): Promise<CampWeek> => {
  if (useMockData) return mock.updateCampWeek(id, input);
  const { data } = await api.patch<{ week: CampWeek }>(`/camp/weeks/${id}`, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    ...(input.teacherIds !== undefined ? { teacherIds: input.teacherIds } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.windowStart !== undefined ? { windowStart: input.windowStart } : {}),
    ...(input.windowEnd !== undefined ? { windowEnd: input.windowEnd } : {}),
  });
  return data.week;
};

/**
 * TASK-418/419 — ONE day of a week: its teachers and/or its window (`camp.week-open`). The server syncs the grid
 * rows (each slot-checked — `409 SLOT_TAKEN` names date · hour · teacher, nothing written), refuses a bad window
 * (`400`), a closed week (`409`), a date outside the week (`404`). The swap door and the editor both come here.
 */
export const updateCampWeekDay = async (weekId: string, date: string, body: CampDayPatch): Promise<CampWeekDayResult> => {
  if (useMockData) return mock.updateCampWeekDay(weekId, date, body);
  const { data } = await api.patch<CampWeekDayResult>(`/camp/weeks/${weekId}/days/${date}`, body);
  return data;
};

export const getCampWeekDays = async (id: string): Promise<CampWeekDays> => {
  if (useMockData) return mock.getCampWeekDays(id);
  const { data } = await api.get<CampWeekDays>(`/camp/weeks/${id}/days`);
  return data;
};

export const listCampPackages = async (studentId: string): Promise<CampPackage[]> => {
  if (useMockData) return mock.listCampPackages(studentId);
  const { data } = await api.get<{ packages: CampPackage[] }>("/camp/packages", { params: { studentId } });
  return data.packages;
};

export const sellCampPackage = async (input: SellCampInput): Promise<{ package: CampPackage; planned: CampDayEntry[] | number }> => {
  if (useMockData) return mock.sellCampPackage(input);
  const { data } = await api.post<{ package: CampPackage; planned: CampDayEntry[] | number }>("/camp/packages", sellCampBody(input));
  return data;
};

export const redeemCampDays = async (packageId: string, weekId: string, dates: string[], half: CampHalf): Promise<{ planned: CampDayEntry[] | number; package: CampPackage }> => {
  if (useMockData) return mock.redeemCampDays(packageId, weekId, dates, half);
  const { data } = await api.post<{ planned: CampDayEntry[] | number; package: CampPackage }>(`/camp/packages/${packageId}/days`, redeemBody(weekId, dates, half));
  return data;
};

/** A mark (`status` alone) or, with `status: "PLANNED"`, the UNDO — then `reason` rides (TASK-403: required only there). */
export const markCampDay = async (dayId: string, status: CampDayStatusWrite, reason?: string): Promise<CampPackage> => {
  if (useMockData) return mock.markCampDay(dayId, status, reason);
  const { data } = await api.patch<{ package: CampPackage }>(`/camp/days/${dayId}`, markBody(status, reason));
  return data.package;
};

/** Lazy — the server mints the day's token on the first view; the same URL comes back until it expires. */
export const getCampDayCheckin = async (dayId: string): Promise<CampDayCheckin> => {
  if (useMockData) return mock.getCampDayCheckin(dayId);
  const { data } = await api.get<CampDayCheckin>(`/camp/days/${dayId}/checkin`);
  return data;
};
