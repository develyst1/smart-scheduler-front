"use client";

import { useState } from "react";
import type { LeaveDayClass, LeaveDayRow } from "@/types/api/contract";
import LeaveClassOpener from "./LeaveClassOpener";
import LeaveDayPanel from "./LeaveDayPanel";

/**
 * 🔴 **TASK-820 — a leave chip's text, made PRESSABLE: it opens the leave panel** (and "Open" on one of its classes closes the panel and opens the booking modal on that class).
 * 📌 Its own component in its own file, like `CancelLeaveButton`: it keeps `LeaveDayBanner.tsx` free of any press-handler, which is what TASK-589's pin reads from that file.
 */
export default function LeaveChip({ row, text, seeAll = false }: { row: LeaveDayRow; text: string; seeAll?: boolean }) {
  const [panel, setPanel] = useState(false);
  const [openClass, setOpenClass] = useState<LeaveDayClass | null>(null);
  return (
    <>
      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setPanel(true)} data-leave-open={`${row.teacherId}|${row.date}`}>
        {text}
      </button>
      {panel && (
        <LeaveDayPanel
          opened
          onClose={() => setPanel(false)}
          row={row}
          seeAll={seeAll}
          onOpenClass={(c) => {
            setPanel(false);
            setOpenClass(c);
          }}
        />
      )}
      {openClass && <LeaveClassOpener classId={openClass.id} date={openClass.date} onClose={() => setOpenClass(null)} />}
    </>
  );
}
