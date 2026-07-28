"use client";

import { Tooltip } from "@mantine/core";
import type { TeacherView } from "@/types/app/scheduler";
import { budgetTone } from "@/lib/scheduler/teacher";
import { useT } from "@/lib/i18n";

// SPEC-008: display-only budget health on a freelance calendar column. Colour + numbers
// come straight from the back-office DTO satang fields — never recomputed on the FE.

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH");

const TONE_CLASS: Record<"green" | "yellow" | "red", string> = {
  green: "bg-success/15 text-success",
  yellow: "bg-warning/15 text-warning",
  red: "bg-danger/15 text-danger",
};

const DOT_CLASS: Record<"green" | "yellow" | "red", string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
};

export default function FreelanceBudgetStrip({ teacher }: { teacher: TeacherView }) {
  const t = useT();
  if (teacher.type !== "FREELANCE") return null;

  const tone = budgetTone(teacher.remainingMinor, teacher.budgetMinor);
  if (!tone) return null; // no budget data → no strip

  const remaining = teacher.remainingMinor ?? 0;
  const budget = teacher.budgetMinor;

  return (
    <Tooltip label={t("calendar.freelanceBudget")} withinPortal>
      <span
        className={`inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${TONE_CLASS[tone]}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[tone]}`} />
        <span className="truncate font-num">
          ฿{baht(remaining)}
          {budget != null && <span className="opacity-60"> / ฿{baht(budget)}</span>}
        </span>
      </span>
    </Tooltip>
  );
}
