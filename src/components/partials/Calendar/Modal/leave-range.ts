import dayjs from "dayjs";
import { ApiClientError } from "@/lib/api/client";

/**
 * 🔴 **TASK-817 (BE) → TASK-822 — the leave RANGE's two refusals, said BEFORE the request and again if the server still refuses.**
 *
 * ✅ The two sentences are APPROVED by the owner (REQ-123 Phase 1, 2026-10-17), and so is the limit: **31 days**, counted inclusive — exactly the server's
 * `(to − from) days + 1 > 31`. A range is only ever sent when it passes this; the server stays the authority (a leave over a month long is its refusal too).
 * 📌 The server answers every `VALIDATION` with ONE generic line (TASK-296) and keeps the real sentence in `details` as a zod issue `{ path: ["to"], message }` —
 * and in THAT ONE language. So the backstop recognises the issue by its message and shows the same approved text in the viewer's language, never the generic line.
 * 🚫 `lib/api/client.ts` (shared) is not touched: this reads `details` itself.
 */
export const MAX_LEAVE_RANGE_DAYS = 31;

export type RangeIssueKey = "teacherLeave.rangeEndBeforeStart" | "teacherLeave.rangeTooLong";

/** The refusal for a range `from … to` (ISO dates), or null. Equal dates are one day, not a range. */
export const leaveRangeIssue = (from: string, to: string): RangeIssueKey | null => {
  if (!from || !to || to === from) return null;
  if (to < from) return "teacherLeave.rangeEndBeforeStart";
  return dayjs(to).diff(dayjs(from), "day") + 1 > MAX_LEAVE_RANGE_DAYS ? "teacherLeave.rangeTooLong" : null;
};

// the server's own sentences (Thai, as `validation.ts` sends them) → which approved key they are
const SERVER_SENTENCES: Record<string, RangeIssueKey> = {
  "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม": "teacherLeave.rangeEndBeforeStart",
  [`ลาล่วงหน้าได้ไม่เกิน ${MAX_LEAVE_RANGE_DAYS} วันต่อครั้ง`]: "teacherLeave.rangeTooLong",
};

/** The range refusal inside a server `VALIDATION` (found in `details`, at the `to` field), or null for anything else. Never throws on shape. */
export const rangeIssueFromError = (e: unknown): RangeIssueKey | null => {
  if (!(e instanceof ApiClientError) || e.code !== "VALIDATION" || !Array.isArray(e.details)) return null;
  for (const d of e.details as unknown[]) {
    const issue = d as { path?: unknown; message?: unknown } | null;
    if (typeof issue?.message === "string" && Array.isArray(issue.path) && issue.path[issue.path.length - 1] === "to" && SERVER_SENTENCES[issue.message]) return SERVER_SENTENCES[issue.message];
  }
  return null;
};
