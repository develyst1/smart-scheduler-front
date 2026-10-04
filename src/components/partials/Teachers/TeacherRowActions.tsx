"use client";

import { useState } from "react";
import { ActionIcon, Alert, Button, Group, Menu, Modal, Select, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { Archive, CalendarOff, MoreVertical, Pencil, Repeat } from "lucide-react";
import ReportLeaveDialog from "@/components/partials/Calendar/Modal/ReportLeaveDialog";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { useArchiveTeacher, useUpdateTeacher } from "@/hooks/scheduler";
import { useCan } from "@/hooks/scheduler/useMe";
import { syncErrorMessage } from "@/lib/scheduler/teacher-errors";
import { TEACHER_TYPE_LABEL, type Teacher, type TeacherType } from "@/types/app/scheduler";

export default function TeacherRowActions({
  teacher,
  onEdit,
}: {
  teacher: Teacher;
  onEdit: () => void;
}) {
  const t = useT();
  const update = useUpdateTeacher();
  const archive = useArchiveTeacher();
  const [changeTypeOpen, setChangeTypeOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [newType, setNewType] = useState<TeacherType>(teacher.type);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  /** 🔴 TASK-611 — the admin's leave door, on the row whose identity cannot be mistaken. */
  const [leaveOpen, setLeaveOpen] = useState(false);

  const openChangeType = () => {
    setNewType(teacher.type);
    setChangeTypeOpen(true);
  };

  // TASK-061: changing FREELANCE → FT/PT closes their monthly freelance budget server-side (TASK-060).
  // Warn before saving, naming the remaining baht (the same `remainingMinor` the calendar strip shows).
  const closingBudget =
    teacher.type === "FREELANCE" && newType !== "FREELANCE" && teacher.remainingMinor != null;
  const remainingBaht = ((teacher.remainingMinor ?? 0) / 100).toLocaleString("th-TH");
  const openArchive = () => {
    setArchiveError(null);
    setArchiveOpen(true);
  };

  const submitChangeType = async () => {
    if (newType === teacher.type) {
      setChangeTypeOpen(false);
      return;
    }
    try {
      await update.mutateAsync({ id: teacher.id, input: { type: newType } });
      notify({ title: t("teachers.updatedOk"), description: teacher.nickname, color: "success" });
      setChangeTypeOpen(false);
    } catch (e) {
      notify({ title: "ผิดพลาด", description: syncErrorMessage(e, t), color: "danger" });
    }
  };

  const submitArchive = async () => {
    setArchiveError(null);
    try {
      await archive.mutateAsync(teacher.id);
      notify({ title: t("teachers.archivedOk"), description: teacher.nickname, color: "success" });
      setArchiveOpen(false);
    } catch (e) {
      // Keep the dialog open on the "has future bookings" block so the admin sees why.
      setArchiveError(syncErrorMessage(e, t));
    }
  };

  // REQ-092 Stage 3 — edit + change type are `teachers.edit`; archive is `teachers.archive`; neither ⇒ no ⋯ menu at all.
  const can = useCan();
  const canEdit = can("action:teachers.edit");
  const canArchive = can("action:teachers.archive");
  /**
   * 🔴 **TASK-611 — `action:calendar.status`, the SAME key @Jason gates the route with, and no new key.**
   * 🔑 Why that one is right rather than merely available, in his words and checked against the registry: its own
   * description is *"บันทึกสถานะคาบ (ยืนยัน/มาเรียน/ลาป่วย/ยกเลิก)"* ⇒ **for today and the past this act is the cancel its
   * holder can already perform session by session**, and **for a future day it only STOPS new bookings** — strictly less
   * than the booking its holder may already make. 🚫 Not `calendar.teacher-leave` (that is the LINKED TEACHER's own key,
   * which admins do not hold ⇒ *a key no role holds is a feature nobody has*), and 🚫 not `calendar.book`/`booking-edit`,
   * which are wider.
   * 🔴 **Hidden without it, never disabled:** *a disabled control tells someone they are missing something; a hidden one
   * tells them nothing, which is correct, because it is not theirs.*
   */
  const canRecordLeave = can("action:calendar.status");
  if (!canEdit && !canArchive && !canRecordLeave) return null;

  return (
    <>
      <Menu shadow="md" position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label={t("teachers.actEdit")}>
            <MoreVertical size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {canEdit && (
            <Menu.Item leftSection={<Pencil size={14} />} onClick={onEdit}>
              {t("teachers.actEdit")}
            </Menu.Item>
          )}
          {canEdit && (
            <Menu.Item leftSection={<Repeat size={14} />} onClick={openChangeType}>
              {t("teachers.actChangeType")}
            </Menu.Item>
          )}
          {canRecordLeave && (
            <Menu.Item leftSection={<CalendarOff size={14} />} onClick={() => setLeaveOpen(true)} data-teacher-leave-open>
              {t("teachers.actRecordLeave")}
            </Menu.Item>
          )}
          {(canEdit || canRecordLeave) && canArchive && <Menu.Divider />}
          {canArchive && (
            <Menu.Item color="red" leftSection={<Archive size={14} />} onClick={openArchive}>
              {t("teachers.actArchive")}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>

      {/* 🔴 TASK-611 — the SAME dialog the teacher uses, given a subject. 🚫 Not a second screen.
          🔑 The default date is TOMORROW, because this door only accepts a day after today: *opening on a date the door
          refuses would teach an admin that the control is broken before they had read the reason.* */}
      {leaveOpen && (
        <ReportLeaveDialog
          opened={leaveOpen}
          initialDate={dayjs().add(1, "day").format("YYYY-MM-DD")}
          onClose={() => setLeaveOpen(false)}
          subject={{ id: teacher.id, name: teacher.nickname || teacher.name }}
        />
      )}

      {/* Change type */}
      <Modal opened={changeTypeOpen} onClose={() => setChangeTypeOpen(false)} title={t("teachers.changeTypeTitle")} centered radius="lg">
        <Stack gap="md">
          <Select
            label={t("teachers.formType")}
            value={newType}
            onChange={(v) => setNewType((v as TeacherType) ?? teacher.type)}
            data={(Object.keys(TEACHER_TYPE_LABEL) as TeacherType[]).map((ty) => ({
              value: ty,
              label: TEACHER_TYPE_LABEL[ty],
            }))}
            allowDeselect={false}
          />
          <Alert variant="light" color="yellow">
            <Text fz="sm">{t("teachers.changeTypeWarn")}</Text>
          </Alert>
          {closingBudget && (
            <Alert variant="light" color="red">
              <Text fz="sm">
                {t("teachers.closeBudgetWarn", { name: teacher.nickname, amount: remainingBaht })}
              </Text>
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setChangeTypeOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button color="green" onClick={submitChangeType} loading={update.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Archive / offboard */}
      <Modal opened={archiveOpen} onClose={() => setArchiveOpen(false)} title={t("teachers.archiveTitle")} centered radius="lg">
        <Stack gap="md">
          <Text fz="sm">{t("teachers.archiveConfirm", { name: teacher.name })}</Text>
          {archiveError && (
            <Alert variant="light" color="red">
              <Text fz="sm">{archiveError}</Text>
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setArchiveOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button color="red" onClick={submitArchive} loading={archive.isPending}>
              {t("teachers.actArchive")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
