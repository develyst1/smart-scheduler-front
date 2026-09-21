"use client";

import { Tooltip } from "@mantine/core";
import type { TeacherView } from "@/types/app/scheduler";
import { budgetTone } from "@/lib/scheduler/teacher";
import { useT } from "@/lib/i18n";
import { minorOrDash } from "@/lib/scheduler/money-or-dash";

// SPEC-008: display-only budget health on a freelance calendar column. Colour + numbers
// come straight from the back-office DTO satang fields — never recomputed on the FE.

const TONE_CLASS: Record<"green" | "yellow" | "red" | "masked", string> = {
  green: "bg-success/15 text-success",
  yellow: "bg-warning/15 text-warning",
  red: "bg-danger/15 text-danger",
  masked: "bg-muted-100 text-muted-500",
};

const DOT_CLASS: Record<"green" | "yellow" | "red" | "masked", string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
  masked: "bg-muted-400",
};

export default function FreelanceBudgetStrip({ teacher }: { teacher: TeacherView }) {
  const t = useT();
  if (teacher.type !== "FREELANCE") return null;

  // REQ-102 (TASK-427) — the figures come back NULL for a user without `teachers.budget-view` (the server masks; the
  // FE only draws): a grey `— / —` strip, so the column reads the same shape for everyone; the tone needs the figures.
  const masked = teacher.remainingMinor == null && teacher.budgetMinor == null;
  const tone = masked ? "masked" : budgetTone(teacher.remainingMinor, teacher.budgetMinor);
  if (!tone) return null; // a freelancer with a budget of 0 / no ceiling yet → no strip (as before)

  return (
    <Tooltip label={t("calendar.freelanceBudget")} withinPortal>
      <span
        className={`inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${TONE_CLASS[tone]}`}
        data-budget-tone={tone}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[tone]}`} />
        <span className="truncate tabular-nums">
          {minorOrDash(teacher.remainingMinor)}
          <span className="opacity-60"> / {minorOrDash(teacher.budgetMinor)}</span>
        </span>
      </span>
    </Tooltip>
  );
}
