// REQ-095 Stage 3a / SPEC-082 (TASK-401/402) — Balance camp: weeks (open · edit · close), the per-day roster, packages
// (sell · redeem · mark). Every rule is the server's: capacity, credit (units), the day transitions, a closed week, a
// date outside the week — refused with named codes whose Thai sentence names the DATE (`CAMP_FULL`, `CAMP_NO_CREDIT`,
// `CAMP_DAY_TAKEN`, `CAMP_WEEK_CLOSED`, `CAMP_DAY_STARTED`, `CAMP_DAY_TRANSITION`, `STUDENT_ARCHIVED`); the dialogs
// show the sentence and keep what was typed. Prices come from `GET /camp/prices` — never a constant here.
import { api, useMockData } from "@/lib/api/client";
import { redeemBody, sellCampBody, type CampHalf, type CampMark, type SellCampInput } from "@/lib/camp/units";
import type { CampDayEntry, CampPackage, CampPrices, CampWeek, CampWeekDays } from "@/types/api/contract";
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
}
export const createCampWeek = async (input: CreateCampWeekInput): Promise<CampWeek> => {
  if (useMockData) return mock.createCampWeek(input);
  const { data } = await api.post<{ week: CampWeek }>("/camp/weeks", {
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    ...(input.teacherIds?.length ? { teacherIds: input.teacherIds } : {}),
  });
  return data.week;
};

export interface UpdateCampWeekInput {
  name?: string;
  capacity?: number | null;
  teacherIds?: string[];
  status?: "OPEN" | "CLOSED";
}
/** By presence — only what changed rides. */
export const updateCampWeek = async (id: string, input: UpdateCampWeekInput): Promise<CampWeek> => {
  if (useMockData) return mock.updateCampWeek(id, input);
  const { data } = await api.patch<{ week: CampWeek }>(`/camp/weeks/${id}`, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    ...(input.teacherIds !== undefined ? { teacherIds: input.teacherIds } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
  return data.week;
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

export const markCampDay = async (dayId: string, status: CampMark): Promise<CampPackage> => {
  if (useMockData) return mock.markCampDay(dayId, status);
  const { data } = await api.patch<{ package: CampPackage }>(`/camp/days/${dayId}`, { status });
  return data.package;
};
