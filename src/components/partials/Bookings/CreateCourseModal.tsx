"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import {
  Modal,
  Button,
  Select,
  TextInput,
  Group,
  Stack,
  Alert,
  Text,
  List,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { CalendarPlus, Info } from "lucide-react";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import { notify } from "@/lib/ui/notify";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { useCreateCoursePackage, useTeachers } from "@/hooks/scheduler";
import { useT } from "@/lib/i18n";
import {
  LEAVE_QUOTA_BY_SIZE,
  MAX_WEEK_BY_SIZE,
  TIME_SLOTS,
  type PackageSize,
} from "@/types/app/scheduler";
import type { CreateCoursePackageResponse } from "@/types/api/contract";

const SIZES: PackageSize[] = [4, 6, 10];

interface Props {
  opened: boolean;
  onClose: () => void;
}

export default function CreateCourseModal({ opened, onClose }: Props) {
  const t = useT();
  const { data: teachers = [] } = useTeachers();
  const create = useCreateCoursePackage();
  const sizeOptions = SIZES.map((s) => ({
    value: String(s),
    label: t("course.sizeOption", { size: s, leave: LEAVE_QUOTA_BY_SIZE[s], week: MAX_WEEK_BY_SIZE[s] }),
  }));

  const [student, setStudent] = useState<StudentSelectValue | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [size, setSize] = useState<PackageSize>(6);
  const [startDate, setStartDate] = useState<string>(dayjs().add(7, "day").format("YYYY-MM-DD"));
  const [startTime, setStartTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<CreateCoursePackageResponse | null>(null);

  const selectedTeacher = teachers.find((tc) => tc.id === teacherId);
  const subjectOptions = selectedTeacher?.subjectOptions ?? [];
  const bookableTeachers = teachers.filter((tc) => bookableOnDate(tc, startDate));

  useEffect(() => {
    if (!opened) {
      setStudent(null);
      setTeacherId("");
      setSubjectId("");
      setSize(6);
      setStartDate(dayjs().add(7, "day").format("YYYY-MM-DD"));
      setStartTime("10:00");
      setNote("");
      setPreview(null);
    }
  }, [opened]);

  useEffect(() => {
    if (subjectOptions.length === 1) setSubjectId(subjectOptions[0].id);
    else setSubjectId("");
  }, [teacherId, subjectOptions.length]);

  const valid =
    student?.name.trim() &&
    teacherId &&
    subjectId &&
    startDate &&
    startTime &&
    !create.isPending;

  const handleSubmit = async () => {
    if (!valid || !startDate) return;
    const result = await create.mutateAsync({
      studentName: student?.name.trim() ?? "",
      studentId: student?.id,
      studentPhone: student?.phone,
      teacherId,
      subjectId,
      size,
      startDate,
      startTime,
      note: note.trim() || undefined,
    });
    setPreview(result);
    notify({
      title: t("course.successTitle"),
      description: t("course.successDesc", { count: result.bookings.length }),
      color: "success",
    });
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <span className="flex items-center gap-2 font-semibold">
          <CalendarPlus size={18} />
          {t("course.formTitle")}
        </span>
      }
      size="lg"
      centered
    >
      {preview ? (
        <Stack gap="md">
          <Alert color="green" title={t("course.createdAlertTitle")}>
            {t("course.createdSummary", {
              name: preview.course.student.name,
              size: preview.course.size,
              expiry: preview.course.expiryDate,
            })}
          </Alert>
          <div>
            <Text size="sm" fw={600} mb={4}>
              {t("course.sessionsCreated", { count: preview.bookings.length })}
            </Text>
            <List size="sm" spacing={4}>
              {preview.bookings.map((b) => (
                <List.Item key={b.id}>
                  {b.date} {b.startTime}–{b.endTime} · {b.teacher.nickname} · {b.subject.name}
                </List.Item>
              ))}
            </List>
          </div>
          <Button onClick={handleClose}>{t("common.close")}</Button>
        </Stack>
      ) : (
        <Stack gap="md">
          <Alert color="blue" icon={<Info size={16} />} variant="light">
            {t("course.infoAlert", {
              leave: LEAVE_QUOTA_BY_SIZE[size],
              week: MAX_WEEK_BY_SIZE[size],
            })}
          </Alert>

          <StudentSelect value={student} onChange={setStudent} required />

          <Select
            label={t("course.teacher")}
            placeholder={t("course.pickTeacher")}
            value={teacherId}
            onChange={(v) => v && setTeacherId(v)}
            data={teacherSelectData(bookableTeachers)}
            renderOption={({ option }) => (
              <TeacherOption option={option} teachers={bookableTeachers} />
            )}
            allowDeselect={false}
            required
          />

          <Select
            label={t("course.program")}
            placeholder={teacherId ? t("course.pickProgram") : t("course.pickTeacherFirst")}
            value={subjectId}
            onChange={(v) => v && setSubjectId(v)}
            data={subjectOptions.map((s) => ({ value: s.id, label: s.name }))}
            disabled={!teacherId || subjectOptions.length === 0}
            allowDeselect={false}
            required
          />

          <Select
            label={t("course.courseSize")}
            value={String(size)}
            onChange={(v) => v && setSize(Number(v) as PackageSize)}
            data={sizeOptions}
            allowDeselect={false}
          />

          <Group grow align="flex-start">
            <DatePickerInput
              label={t("course.firstDate")}
              value={startDate}
              onChange={(v) => v && setStartDate(v)}
              valueFormat="D MMM YYYY"
              minDate={new Date()}
              required
            />
            <Select
              label={t("course.time")}
              value={startTime}
              onChange={(v) => v && setStartTime(v)}
              data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
              allowDeselect={false}
            />
          </Group>

          <TextInput
            label={t("course.noteField")}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />

          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button loading={create.isPending} disabled={!valid} onClick={handleSubmit}>
              {t("course.submitBtn")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
