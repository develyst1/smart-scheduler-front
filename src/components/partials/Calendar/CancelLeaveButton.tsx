"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { useT } from "@/lib/i18n";
import { useCan } from "@/hooks/scheduler/useMe";
import LiftLeaveConfirm from "./LiftLeaveConfirm";

/**
 * 🔴 **TASK-814 — "Cancel leave", the leave chip's one control (acts on the LEAVE only).**
 *
 * 🔑 **Offered only for a FUTURE day, and only with the admin's `action:calendar.status`** — otherwise it renders nothing at all
 * (not a greyed button). The server refuses today/past too (400); this is the door being absent, not the only guard.
 * 📌 **Its own component in its own file, for two reasons:** TASK-820 turns the chip into a panel and this moves whole; and
 * `LeaveDayBanner.tsx` stays free of any press-handler, which is what TASK-589's pin ("the strip is not a control for the
 * CLASSES") reads from that file.
 * ⚠️ The key is asked as a LITERAL: `action-gate.test.ts` sweeps `src` for them to find every door in the product.
 */
export default function CancelLeaveButton({ teacherId, teacherName, date, restores = 0 }: { teacherId: string; teacherName: string; date: string; restores?: number }) {
  const t = useT();
  const can = useCan();
  const [open, setOpen] = useState(false);
  if (!can("action:calendar.status") || date <= dayjs().format("YYYY-MM-DD")) return null;
  return (
    <>
      <button
        type="button"
        className="rounded border border-current px-1.5 py-0.5 text-xs font-medium underline-offset-2 hover:underline"
        data-leave-cancel={`${teacherId}|${date}`}
        onClick={() => setOpen(true)}
      >
        {t("leaveDays.cancelLeave")}
      </button>
      <LiftLeaveConfirm opened={open} onClose={() => setOpen(false)} teacherId={teacherId} teacherName={teacherName} date={date} restoreN={restores} />
    </>
  );
}
