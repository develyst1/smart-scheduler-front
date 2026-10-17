"use client";

import { Select } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { useTeachers } from "@/hooks/scheduler";

/**
 * 🔴 **TASK-818 — "whose leave is this?" for the calendar's admin door.** 🚫 Not asked on the Teachers menu, which already chose.
 * 📌 **Its own file on purpose:** `ReportLeaveDialog.tsx` is mounted for a LINKED teacher too, and TASK-406's pin lists the only data hooks that file may hold
 * (`useCalendar · useReportOwnLeave · useReportTeacherLeave`) — a teacher-scoped session must never be able to list the other teachers (403 `SCOPE_TEACHER`).
 * This component renders only when the admin entry asks for it (`pickTeacher`), and only active teachers are offered.
 */
export default function LeaveTeacherPick({ value, onPick }: { value: { id: string; name: string } | null; onPick: (v: { id: string; name: string } | null) => void }) {
  const t = useT();
  const { data: teachers = [] } = useTeachers();
  const active = teachers.filter((x) => x.active);
  return (
    <Select
      label={t("teacherLeave.adminSubject")}
      value={value?.id ?? null}
      onChange={(id) => {
        const found = active.find((x) => x.id === id);
        onPick(found ? { id: found.id, name: found.nickname || found.name } : null);
      }}
      data={active.map((x) => ({ value: x.id, label: x.nickname || x.name }))}
      searchable
      allowDeselect={false}
      comboboxProps={{ withinPortal: true }}
      data-leave-teacher-pick
    />
  );
}
