import { ApiClientError } from "@/lib/api/client";

type Translate = (key: string, params?: Record<string, string | number>) => string;

// Map the teacher-lifecycle API error codes (SPEC-004 / TASK-016) to friendly copy:
//  - HAS_FUTURE_BOOKINGS (409): archive blocked — clear/reassign bookings first
//  - OPS_SYNC_FAILED (502): backoffice sync failed — retryable
export function syncErrorMessage(err: unknown, t: Translate, fallback?: string): string {
  if (err instanceof ApiClientError) {
    if (err.code === "HAS_FUTURE_BOOKINGS") return t("teachers.hasFutureBookings");
    if (err.code === "OPS_SYNC_FAILED") return t("teachers.syncFailed");
    return err.message;
  }
  return fallback ?? t("teachers.syncFailed");
}
