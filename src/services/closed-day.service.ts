import dayjs from "dayjs";
import { api, ApiClientError } from "@/lib/api/client";
import type { CloseDaysBody, CloseDaysResult, ClosedDayRow, ReopenDayResult } from "@/types/api/contract";

/**
 * 🔴 **TASK-960 (SPEC-105 §3, REQ-5013 option B) — close a whole day.** The three routes sit on the staff API beside `/teacher-leave-days`:
 * `GET /closed-days?from&to` · `POST /closed-days` · `DELETE /closed-days/:date`. A linked teacher is refused (403) — the hooks' `enabled` is the gate, never a catch.
 *
 * 🔑 **Built against the contract before the server exists.** With `NEXT_PUBLIC_USE_MOCK=true` a typed in-memory FAKE answers exactly the §3 shapes AND its three refusals
 * (`PAST_DATE` · `NOTE_REQUIRED` · `RANGE_TOO_LONG`, `NOT_CLOSED`), so the screens are exercised end to end; the real API is the same functions without the flag. 🚫 The fake holds no
 * bookings (`bookings: []`, `classesOnThem: 0`): the real answer is the server's.
 */
const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

const fakeRows: ClosedDayRow[] = [];
const refuse = (code: string, message: string, status = 400): never => {
  throw new ApiClientError(code, message, status);
};
const today = () => dayjs().format("YYYY-MM-DD");

const fakeClose = (body: CloseDaysBody): CloseDaysResult => {
  const to = body.to ?? body.from;
  if (body.from < today()) refuse("PAST_DATE", "ปิดวันที่ผ่านมาแล้วไม่ได้");
  if (body.reason === "OTHER" && !body.note?.trim()) refuse("NOTE_REQUIRED", "กรุณาระบุหมายเหตุ");
  const days = dayjs(to).diff(dayjs(body.from), "day") + 1;
  if (days > 31) refuse("RANGE_TOO_LONG", "ปิดได้ครั้งละไม่เกิน 31 วัน");
  const rangeId = days > 1 ? `fake-range-${Date.now()}` : null;
  const created: string[] = [];
  const alreadyClosed: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = dayjs(body.from).add(i, "day").format("YYYY-MM-DD");
    if (fakeRows.some((r) => r.date === date)) {
      alreadyClosed.push(date);
      continue;
    }
    fakeRows.push({ date, reason: body.reason, note: body.note?.trim() || null, rangeId, createdBy: "mock", createdAt: new Date().toISOString(), bookings: [] });
    created.push(date);
  }
  return { created, alreadyClosed, classesOnThem: 0 };
};

export const getClosedDays = async (from: string, to: string): Promise<ClosedDayRow[]> => {
  if (useMock) return fakeRows.filter((r) => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const { data } = await api.get<{ items: ClosedDayRow[] }>("/closed-days", { params: { from, to } });
  return data.items;
};

export const closeDays = async (body: CloseDaysBody): Promise<CloseDaysResult> => {
  if (useMock) return fakeClose(body);
  const { data } = await api.post<CloseDaysResult>("/closed-days", body);
  return data;
};

/** Re-open (soft): restores nothing, messages no one. */
export const reopenDay = async (date: string): Promise<ReopenDayResult> => {
  if (useMock) {
    const i = fakeRows.findIndex((r) => r.date === date);
    if (i < 0) refuse("NOT_CLOSED", "วันนี้ไม่ได้ปิดอยู่", 404);
    if (date < today()) refuse("PAST_DATE", "เปิดวันที่ผ่านมาแล้วไม่ได้");
    fakeRows.splice(i, 1);
    return { date, reopened: true };
  }
  const { data } = await api.delete<ReopenDayResult>(`/closed-days/${encodeURIComponent(date)}`);
  return data;
};
