"use client";

import { useState } from "react";
import {
  Modal,
  Button,
  Select,
  TextInput,
  Divider,
  Group,
  Stack,
} from "@mantine/core";
import { BadgeCheck, CalendarX2, Bell } from "lucide-react";
import { BookingTypeChip, StatusChip } from "@/components/common/BookingBadges";
import { notify } from "@/lib/ui/notify";
import {
  useConfirmBooking,
  useCreateBooking,
  useMarkAttended,
  useMarkSickLeave,
} from "@/hooks/scheduler";
import type { Booking, BookingType, Teacher } from "@/types/app/scheduler";
import { TIME_SLOTS } from "@/types/app/scheduler";
import { BOOKING_TYPE_OPTIONS } from "../Calendar.config";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  booking?: Booking;
  createSlot?: { teacherId: string; time: string; date: string };
  teachers: Teacher[];
}

export default function BookingModal({ isOpen, onClose, booking, createSlot, teachers }: Props) {
  const isCreate = !booking;
  const teacher = teachers.find((t) => t.id === (booking?.teacherId ?? createSlot?.teacherId));

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="lg"
      centered
      title={
        isCreate ? (
          <span className="font-semibold">เพิ่มการจอง · {createSlot?.date}</span>
        ) : booking ? (
          <div className="flex flex-col gap-1">
            <span className="font-semibold">{booking.studentName}</span>
            <div className="flex items-center gap-2">
              <StatusChip status={booking.status} />
              <BookingTypeChip type={booking.bookingType} />
            </div>
          </div>
        ) : null
      }
    >
      {isCreate && createSlot ? (
        <CreateForm createSlot={createSlot} teachers={teachers} onClose={onClose} />
      ) : booking ? (
        <ViewBooking booking={booking} teacherName={teacher?.name ?? "-"} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

// ───────────────────────── View / actions ─────────────────────────

function ViewBooking({
  booking,
  teacherName,
  onClose,
}: {
  booking: Booking;
  teacherName: string;
  onClose: () => void;
}) {
  const confirm = useConfirmBooking();
  const attended = useMarkAttended();
  const sickLeave = useMarkSickLeave();

  const handleConfirm = async () => {
    await confirm.mutateAsync(booking.id);
    notify({
      title: "ยืนยันตารางแล้ว",
      description: "ส่งแจ้งเตือนทันทีผ่าน Line ไปยังครู/ผู้เกี่ยวข้อง",
      color: "primary",
    });
    onClose();
  };

  const handleSickLeave = async () => {
    const res = await sickLeave.mutateAsync(booking.id);
    if (res.locked) {
      notify({
        title: "ลาเกินโควตา — ล็อกการเลื่อนตาราง",
        description: "นักเรียนใช้สิทธิ์การลาครบแล้ว ต้องให้แอดมินปลดล็อกที่หน้า การจอง/นักเรียน",
        color: "danger",
      });
    } else if (res.extended) {
      notify({
        title: "บันทึกการลาแล้ว",
        description: `สร้างคาบเรียนชดเชยอัตโนมัติในสัปดาห์ถัดไป (${res.extended.date})`,
        color: "success",
      });
    } else {
      notify({ title: "บันทึกการลาแล้ว", color: "default" });
    }
    onClose();
  };

  const handleAttended = async () => {
    await attended.mutateAsync(booking.id);
    notify({ title: "บันทึกการเข้าเรียนแล้ว", color: "success" });
    onClose();
  };

  return (
    <Stack gap="md">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Field label="ครูผู้สอน" value={teacherName} />
        <Field label="วิชา" value={booking.subject} />
        <Field label="วันที่" value={booking.date} />
        <Field label="เวลา" value={`${booking.startTime} - ${booking.endTime}`} />
      </dl>
      {booking.note && (
        <>
          <Divider />
          <p className="text-sm text-default-500">หมายเหตุ: {booking.note}</p>
        </>
      )}

      <Group justify="flex-end" gap="sm" wrap="wrap">
        <Button variant="subtle" color="gray" onClick={onClose}>
          ปิด
        </Button>
        <Button
          variant="light"
          color="gray"
          leftSection={<CalendarX2 size={16} />}
          loading={sickLeave.isPending}
          onClick={handleSickLeave}
        >
          บันทึกลา/ป่วย
        </Button>
        <Button
          variant="light"
          color="green"
          leftSection={<BadgeCheck size={16} />}
          loading={attended.isPending}
          onClick={handleAttended}
        >
          มาเรียน
        </Button>
        {booking.status === "PENDING" && (
          <Button
            color="blue"
            leftSection={<Bell size={16} />}
            loading={confirm.isPending}
            onClick={handleConfirm}
          >
            ยืนยัน + แจ้งเตือน Line
          </Button>
        )}
      </Group>
    </Stack>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-default-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// ───────────────────────── Create form ─────────────────────────

function CreateForm({
  createSlot,
  teachers,
  onClose,
}: {
  createSlot: { teacherId: string; time: string; date: string };
  teachers: Teacher[];
  onClose: () => void;
}) {
  const create = useCreateBooking();
  const [studentName, setStudentName] = useState("");
  const [teacherId, setTeacherId] = useState(createSlot.teacherId);
  const [subject, setSubject] = useState("");
  const [startTime, setStartTime] = useState(createSlot.time);
  const [bookingType, setBookingType] = useState<BookingType>("SINGLE_SESSION");

  const valid = studentName.trim() && subject.trim() && teacherId && startTime;

  const handleSubmit = async () => {
    if (!valid) return;
    await create.mutateAsync({
      studentName: studentName.trim(),
      teacherId,
      subject: subject.trim(),
      date: createSlot.date,
      startTime,
      bookingType,
    });
    notify({ title: "สร้างการจองแล้ว", description: "สถานะ: รอยืนยัน", color: "success" });
    onClose();
  };

  return (
    <Stack gap="md">
      <TextInput
        label="ชื่อนักเรียน"
        value={studentName}
        onChange={(e) => setStudentName(e.currentTarget.value)}
        required
      />
      <TextInput
        label="วิชา"
        value={subject}
        onChange={(e) => setSubject(e.currentTarget.value)}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="ครูผู้สอน"
          value={teacherId}
          onChange={(v) => setTeacherId(v ?? "")}
          data={teachers
            .filter((t) => t.active)
            .map((t) => ({ value: t.id, label: t.nickname }))}
          allowDeselect={false}
        />
        <Select
          label="เวลา"
          value={startTime}
          onChange={(v) => setStartTime(v ?? "")}
          data={TIME_SLOTS.map((t) => ({ value: t, label: t }))}
          allowDeselect={false}
        />
      </div>
      <Select
        label="รูปแบบการจอง"
        value={bookingType}
        onChange={(v) => setBookingType((v ?? "SINGLE_SESSION") as BookingType)}
        data={BOOKING_TYPE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
        allowDeselect={false}
      />

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" color="gray" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button color="blue" disabled={!valid} loading={create.isPending} onClick={handleSubmit}>
          บันทึก
        </Button>
      </Group>
    </Stack>
  );
}
