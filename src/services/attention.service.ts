import { api, useMockData } from "@/lib/api/client";
import type { AttentionResponse } from "@/types/app/attention";

// Offline mock for the panel: a realistic mix incl. a zero-count check and a degraded (count:null) one.
// Set localStorage `attn_never = "1"` (then reload) to see the "digest never run" warning state.
const mockAttention = (): AttentionResponse => {
  const neverRun = typeof window !== "undefined" && window.localStorage?.getItem("attn_never") === "1";
  return {
    checks: [
      {
        key: "unconfirmed_bookings",
        titleKey: "att_unconfirmed_bookings",
        title: "การจองที่ยังไม่ยืนยัน (วันนี้/พรุ่งนี้)",
        count: 2,
        items: [
          { id: "b1", label: "พีพี · ครูบีม · 10:00 วันนี้", hint: "Surfskate" },
          { id: "b2", label: "มีมี่ · ครูแอน · 14:00 พรุ่งนี้", hint: null },
        ],
      },
      {
        key: "teachers_without_line",
        titleKey: "att_teachers_without_line",
        title: "ครูที่ยังไม่ผูก LINE",
        count: 1,
        items: [{ id: "t1", label: "ครูเอิร์ธ (Freelance)" }],
      },
      {
        key: "expiring_entitlements",
        titleKey: "att_expiring_entitlements",
        title: "คอร์ส/วอยเชอร์ใกล้หมดอายุ",
        count: 1,
        items: [{ id: "e1", label: "น้องมายด์ · คอร์ส Surfskate", hint: "หมดอายุ 2026-08-10" }],
      },
      {
        key: "nearly_finished_courses",
        titleKey: "att_nearly_finished_courses",
        title: "คอร์สที่ใกล้จบ (ต่ออายุ)",
        count: 0,
        items: [],
      },
      {
        key: "freelance_near_cap",
        titleKey: "att_freelance_near_cap",
        title: "ครูฟรีแลนซ์ใกล้/เกินเพดานงบ",
        count: 0,
        items: [],
      },
      {
        key: "incomplete_students",
        titleKey: "att_incomplete_students",
        title: "นักเรียนที่ข้อมูลไม่ครบ",
        count: 3,
        items: [],
      },
      {
        key: "yesterday_no_shows",
        titleKey: "att_yesterday_no_shows",
        title: "ไม่มาเรียนเมื่อวาน",
        count: null, // degraded — the query errored
        items: [],
      },
      {
        // 9th check (TASK-075) — counts-only by design: a worklist, not a person. The panel links it to
        // the queue screen so a check with no items still has somewhere to act.
        key: "pending_teacher_links",
        titleKey: "att_pending_teacher_links",
        title: "คำขอผูก LINE ของครูที่รออนุมัติ",
        count: 3,
        items: [],
      },
    ],
    lastRun: neverRun ? null : { runDate: "2026-08-01", finishedAt: "2026-08-01T08:00:12.000Z", sent: true },
  };
};

/** REQ-023: the same producer that backs the 08:00 digest. The FE renders it as-is (no recomputation). */
export const getAttention = async (): Promise<AttentionResponse> => {
  if (useMockData) return mockAttention();
  const { data } = await api.get<AttentionResponse>("/attention");
  return data;
};
