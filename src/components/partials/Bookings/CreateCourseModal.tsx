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
import { notify } from "@/lib/ui/notify";
import { useCreateCoursePackage, useTeachers } from "@/hooks/scheduler";
import {
  LEAVE_QUOTA_BY_SIZE,
  MAX_WEEK_BY_SIZE,
  TIME_SLOTS,
  type PackageSize,
} from "@/types/app/scheduler";
import type { CreateCoursePackageResponse } from "@/types/api/contract";

const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "4", label: "4 ครั้ง (ลาได้ 1 · ขยายถึงสัปดาห์ที่ 5)" },
  { value: "6", label: "6 ครั้ง (ลาได้ 2 · ขยายถึงสัปดาห์ที่ 8)" },
  { value: "10", label: "10 ครั้ง (ลาได้ 3 · ขยายถึงสัปดาห์ที่ 13)" },
];

interface Props {
  opened: boolean;
  onClose: () => void;
}

export default function CreateCourseModal({ opened, onClose }: Props) {
  const { data: teachers = [] } = useTeachers();
  const create = useCreateCoursePackage();

  const [studentName, setStudentName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [size, setSize] = useState<PackageSize>(6);
  const [startDate, setStartDate] = useState<string>(dayjs().add(7, "day").format("YYYY-MM-DD"));
  const [startTime, setStartTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<CreateCoursePackageResponse | null>(null);

  const selectedTeacher = teachers.find((t) => t.id === teacherId);
  const subjectOptions = selectedTeacher?.subjectOptions ?? [];
  const bookableTeachers = teachers.filter((t) => t.bookable);

  useEffect(() => {
    if (!opened) {
      setStudentName("");
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
    studentName.trim() &&
    teacherId &&
    subjectId &&
    startDate &&
    startTime &&
    !create.isPending;

  const handleSubmit = async () => {
    if (!valid || !startDate) return;
    const result = await create.mutateAsync({
      studentName: studentName.trim(),
      teacherId,
      subjectId,
      size,
      startDate,
      startTime,
      note: note.trim() || undefined,
    });
    setPreview(result);
    notify({
      title: "สมัครคอร์สสำเร็จ",
      description: `สร้าง ${result.bookings.length} คาบรายสัปดาห์แล้ว`,
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
          สมัครคอร์สรายสัปดาห์
        </span>
      }
      size="lg"
      centered
    >
      {preview ? (
        <Stack gap="md">
          <Alert color="green" title="สร้างคอร์สและล็อกตารางแล้ว">
            {preview.course.student.name} · คอร์ส {preview.course.size} ครั้ง · หมดอายุ{" "}
            {preview.course.expiryDate}
          </Alert>
          <div>
            <Text size="sm" fw={600} mb={4}>
              คาบที่สร้าง ({preview.bookings.length})
            </Text>
            <List size="sm" spacing={4}>
              {preview.bookings.map((b) => (
                <List.Item key={b.id}>
                  {b.date} {b.startTime}–{b.endTime} · {b.teacher.nickname} · {b.subject.name}
                </List.Item>
              ))}
            </List>
          </div>
          <Button onClick={handleClose}>ปิด</Button>
        </Stack>
      ) : (
        <Stack gap="md">
          <Alert color="blue" icon={<Info size={16} />} variant="light">
            ระบบจะสร้างคาบรายสัปดาห์ตามวัน-เวลาเริ่มต้น · ลาได้{" "}
            {LEAVE_QUOTA_BY_SIZE[size]} ครั้ง · ขยายได้ถึงสัปดาห์ที่ {MAX_WEEK_BY_SIZE[size]}
          </Alert>

          <TextInput
            label="ชื่อนักเรียน"
            placeholder="เช่น น้องพีพี"
            value={studentName}
            onChange={(e) => setStudentName(e.currentTarget.value)}
            required
          />

          <Select
            label="ครูผู้สอน"
            placeholder="เลือกครู"
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
            label="โปรแกรม"
            placeholder={teacherId ? "เลือกโปรแกรม" : "เลือกครูก่อน"}
            value={subjectId}
            onChange={(v) => v && setSubjectId(v)}
            data={subjectOptions.map((s) => ({ value: s.id, label: s.name }))}
            disabled={!teacherId || subjectOptions.length === 0}
            allowDeselect={false}
            required
          />

          <Select
            label="ขนาดคอร์ส"
            value={String(size)}
            onChange={(v) => v && setSize(Number(v) as PackageSize)}
            data={SIZE_OPTIONS}
            allowDeselect={false}
          />

          <Group grow align="flex-start">
            <DatePickerInput
              label="วันเริ่มคาบแรก"
              value={startDate}
              onChange={(v) => v && setStartDate(v)}
              valueFormat="D MMM YYYY"
              minDate={new Date()}
              required
            />
            <Select
              label="เวลา"
              value={startTime}
              onChange={(v) => v && setStartTime(v)}
              data={TIME_SLOTS.map((t) => ({ value: t, label: t }))}
              allowDeselect={false}
            />
          </Group>

          <TextInput
            label="หมายเหตุ (ถ้ามี)"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />

          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={handleClose}>
              ยกเลิก
            </Button>
            <Button loading={create.isPending} disabled={!valid} onClick={handleSubmit}>
              สมัคร + สร้างคาบ
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
