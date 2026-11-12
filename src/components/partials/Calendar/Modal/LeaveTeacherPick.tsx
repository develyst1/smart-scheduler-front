"use client";

import { MultiSelect } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { useTeachers } from "@/hooks/scheduler";

/**
 * 🔴 **TASK-818 — "whose leave is this?" for the calendar's admin door.** 🚫 Not asked on the Teachers menu, which already chose.
 * 📌 **Its own file on purpose:** `ReportLeaveDialog.tsx` is mounted for a LINKED teacher too, and TASK-406's pin lists the only data hooks that file may hold
 * (`useCalendar · useReportOwnLeave · useReportTeacherLeave`) — a teacher-scoped session must never be able to list the other teachers (403 `SCOPE_TEACHER`).
 * This component renders only when the admin entry asks for it (`pickTeacher`), and only active teachers are offered.
 *
 * 🔴 **TASK-966 (SPEC-108 §3.5, REQ-5015 AC1) — one leave for SEVERAL coaches: this is now a MULTI-select** (the same act, once per coach; the dialog does the saving and shows a result per coach).
 * Chosen coaches come back in the order they were picked, as `{ id, name }`.
 */
export default function LeaveTeacherPick({ value, onPick }: { value: { id: string; name: string }[]; onPick: (v: { id: string; name: string }[]) => void }) {
  const t = useT();
  const { data: teachers = [] } = useTeachers();
  const active = teachers.filter((x) => x.active);
  return (
    <MultiSelect
      label={t("teacherLeave.adminSubject")}
      value={value.map((v) => v.id)}
      onChange={(ids) =>
        onPick(
          ids.flatMap((id) => {
            const found = active.find((x) => x.id === id);
            return found ? [{ id: found.id, name: found.nickname || found.name }] : [];
          }),
        )
      }
      data={active.map((x) => ({ value: x.id, label: x.nickname || x.name }))}
      searchable
      comboboxProps={{ withinPortal: true }}
      data-leave-teacher-pick
    />
  );
}
