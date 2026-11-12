"use client";

import { useState } from "react";
import type { ClosedDayRow, LeaveDayClass } from "@/types/api/contract";
import ClosedDayPanel from "./ClosedDayPanel";
import LeaveClassOpener from "./LeaveClassOpener";

/**
 * 🔴 **TASK-960 — a closed day's chip text, made PRESSABLE: it opens the closed-day panel** (and "Open" on one of its classes closes the panel and opens the booking modal on that
 * class, through the same `LeaveClassOpener` the leave panel uses). Its own file, like `LeaveChip`, so `ClosedDayBanner.tsx` holds no press-handler.
 */
export default function ClosedDayChip({ row, text }: { row: ClosedDayRow; text: string }) {
  const [panel, setPanel] = useState(false);
  const [openClass, setOpenClass] = useState<LeaveDayClass | null>(null);
  return (
    <>
      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setPanel(true)} data-closed-open={row.date}>
        {text}
      </button>
      {panel && (
        <ClosedDayPanel
          opened
          onClose={() => setPanel(false)}
          row={row}
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
