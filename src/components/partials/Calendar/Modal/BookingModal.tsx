"use client";

import { useState, useEffect } from "react";
import {
  Modal,
  Button,
  Select,
  Divider,
  Group,
  Stack,
  Alert,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { BadgeCheck, CalendarX2, Bell, AlertTriangle, ArrowLeftRight, Move } from "lucide-react";
import { BookingTypeChip, StatusChip } from "@/components/common/BookingBadges";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import { notify } from "@/lib/ui/notify";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { ApiClientError } from "@/lib/api/client";
import {
  useConfirmBooking,
  useCreateBooking,
  useDetectConflict,
  useMarkAttended,
  useMarkSickLeave,
  useMoveBooking,
} from "@/hooks/scheduler";
import type { Booking, BookingType, TeacherView } from "@/types/app/scheduler";
import type { CreateBookingInput, MoveBookingInput } from "@/services/scheduler.service";
import { TIME_SLOTS } from "@/types/app/scheduler";
import { BOOKING_TYPE_OPTIONS } from "../Calendar.config";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  booking?: Booking;
  createSlot?: { teacherId: string; time: string; date: string };
  teachers: TeacherView[];
  bookings: Booking[];
  onOverbook: (b: Booking) => void;
}

/** คาบที่ย้ายด้วยมือได้ (UC-003) — ไม่รวมที่มาเรียน/ลา/ยกเลิกแล้ว */
const MOVABLE_STATUSES: Booking["status"][] = ["PENDING", "CONFIRMED", "EXTENDED"];

export default function BookingModal({
  isOpen,
  onClose,
  booking,
  createSlot,
  teachers,
  bookings,
  onOverbook,
}: Props) {
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
        <CreateForm createSlot={createSlot} teachers={teachers} bookings={bookings} onClose={onClose} />
      ) : booking ? (
        <ViewBooking
          booking={booking}
          teacherName={teacher?.name ?? "-"}
          teachers={teachers}
          onOverbook={onOverbook}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

// ───────────────────────── View / actions ─────────────────────────

function ViewBooking({
  booking,
  teacherName,
  teachers,
  onOverbook,
  onClose,
}: {
  booking: Booking;
  teacherName: string;
  teachers: TeacherView[];
  onOverbook: (b: Booking) => void;
  onClose: () => void;
}) {
  const confirm = useConfirmBooking();
  const attended = useMarkAttended();
  const sickLeave = useMarkSickLeave();

  const [moving, setMoving] = useState(false);

  const handleConfirm = async () => {
    const res = await confirm.mutateAsync(booking.id);
    const n = res.notification;
    if (n?.status === "queued") {
      notify({
        title: "ยืนยันตารางแล้ว",
        description: "ส่งแจ้งเตือน LINE ไปยังครูแล้ว",
        color: "primary",
      });
    } else if (n?.status === "skipped") {
      notify({
        title: "ยืนยันตารางแล้ว",
        description: n.reason ?? "ครูยังไม่ผูก LINE — ไม่ได้ส่งแจ้งเตือน",
        color: "warning",
      });
    } else {
      notify({
        title: "ยืนยันตารางแล้ว",
        description: "ส่งแจ้งเตือนทันทีผ่าน Line ไปยังครู/ผู้เกี่ยวข้อง",
        color: "primary",
      });
    }
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

  // ── โหมดย้ายคาบด้วยมือ (UC-003) ──
  if (moving) {
    return (
      <MoveBookingForm
        booking={booking}
        teachers={teachers}
        onCancel={() => setMoving(false)}
        onClose={onClose}
      />
    );
  }

  // ── โหมดดูปกติ ──
  // จองทับได้เฉพาะช่องที่นักเรียนเดิม "ลา" เท่านั้น (UC-004)
  const canOverbook = booking.status === "SICK_LEAVE";
  const canMove = MOVABLE_STATUSES.includes(booking.status);

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

      <Group justify="space-between" gap="sm" wrap="wrap">
        <Group gap="sm" wrap="wrap">
          {canOverbook && (
            <Button
              variant="light"
              color="orange"
              leftSection={<ArrowLeftRight size={16} />}
              onClick={() => onOverbook(booking)}
            >
              จองทับ (นักเรียนลา)
            </Button>
          )}
          {canMove && (
            <Button
              variant="light"
              color="grape"
              leftSection={<Move size={16} />}
              onClick={() => setMoving(true)}
            >
              ย้ายคาบ
            </Button>
          )}
        </Group>

        <Group gap="sm" wrap="wrap">
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
      </Group>
    </Stack>
  );
}

// ───────────────────────── Manual move (UC-003) ─────────────────────────

function MoveBookingForm({
  booking,
  teachers,
  onCancel,
  onClose,
}: {
  booking: Booking;
  teachers: TeacherView[];
  onCancel: () => void;
  onClose: () => void;
}) {
  const move = useMoveBooking();
  const [teacherId, setTeacherId] = useState(booking.teacherId);
  const [date, setDate] = useState(booking.date);
  const [startTime, setStartTime] = useState(booking.startTime);

  const bookableTeachers = teachers.filter((t) => bookableOnDate(t, date));

  const handleSubmit = async () => {
    const patch: MoveBookingInput = {};
    if (teacherId !== booking.teacherId) patch.teacherId = teacherId;
    if (date !== booking.date) patch.date = date;
    if (startTime !== booking.startTime) patch.startTime = startTime;

    if (Object.keys(patch).length === 0) {
      notify({ title: "ไม่มีการเปลี่ยนแปลง", color: "default" });
      onCancel();
      return;
    }

    try {
      await move.mutateAsync({ id: booking.id, patch });
      notify({
        title: "ย้ายคาบแล้ว",
        description: `${date} ${startTime}`,
        color: "success",
      });
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiClientError && e.code === "SLOT_TAKEN"
          ? "ครูมีคาบในช่วงเวลานี้แล้ว — เลือกวัน/เวลา/ครูอื่น"
          : e instanceof ApiClientError
            ? e.message
            : "ย้ายคาบไม่สำเร็จ";
      notify({ title: "ย้ายคาบไม่สำเร็จ", description: msg, color: "danger" });
    }
  };

  return (
    <Stack gap="md">
      <Alert color="grape" icon={<Move size={18} />} title="ย้ายคาบด้วยมือ">
        ย้ายครู / วัน / เวลา สำหรับกรณีพิเศษ — ถ้าช่องปลายทางมีคาบอยู่แล้วจะย้ายไม่ได้
      </Alert>

      <Select
        label="ครูผู้สอน"
        value={teacherId}
        onChange={(v) => v && setTeacherId(v)}
        allowDeselect={false}
        data={teacherSelectData(bookableTeachers)}
        renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
      />
      <div className="grid grid-cols-2 gap-3">
        <DatePickerInput
          label="วันที่"
          value={date}
          onChange={(v) => v && setDate(v)}
          valueFormat="D MMM YYYY"
          styles={{ input: { textAlign: "left" } }}
        />
        <Select
          label="เวลา"
          value={startTime}
          onChange={(v) => v && setStartTime(v)}
          allowDeselect={false}
          data={TIME_SLOTS.map((t) => ({ value: t, label: t }))}
        />
      </div>

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" color="gray" onClick={onCancel}>
          ย้อนกลับ
        </Button>
        <Button color="grape" loading={move.isPending} onClick={handleSubmit}>
          ยืนยันย้ายคาบ
        </Button>
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

// ───────────────────────── Create form (+ จองทับคนลา) ─────────────────────────

function CreateForm({
  createSlot,
  teachers,
  bookings,
  onClose,
}: {
  createSlot: { teacherId: string; time: string; date: string };
  teachers: TeacherView[];
  bookings: Booking[];
  onClose: () => void;
}) {
  const create = useCreateBooking();
  const detect = useDetectConflict();

  const [student, setStudent] = useState<StudentSelectValue | null>(null);
  const [teacherId, setTeacherId] = useState(createSlot.teacherId);
  const [subjectId, setSubjectId] = useState("");
  const [startTime, setStartTime] = useState(createSlot.time);
  const [bookingType, setBookingType] = useState<BookingType>("SINGLE_SESSION");
  // ช่องที่ถูกจองอยู่แล้วและ "ไม่ใช่การลา" → จองทับไม่ได้ (UC-004)
  const [blocked, setBlocked] = useState<Booking | undefined>();

  const selectedTeacher = teachers.find((t) => t.id === teacherId);
  const subjectOptions = selectedTeacher?.subjectOptions ?? [];

  useEffect(() => {
    if (subjectOptions.length === 1) setSubjectId(subjectOptions[0].id);
  }, [teacherId, subjectOptions.length]);

  // นักเรียนเดิมที่ลาในช่องนี้ (ถ้ามี) — จองทับได้เฉพาะกรณีนี้
  const leaveOccupant = bookings.find(
    (b) =>
      b.teacherId === createSlot.teacherId &&
      b.date === createSlot.date &&
      b.startTime === createSlot.time &&
      b.status === "SICK_LEAVE",
  );

  const valid = student?.name.trim() && subjectId && teacherId && startTime;

  const subjectName =
    subjectOptions.find((s) => s.id === subjectId)?.name ??
    selectedTeacher?.subjects[0] ??
    "";

  const input: CreateBookingInput = {
    studentName: student?.name.trim() ?? "",
    studentId: student?.id,
    studentPhone: student?.phone,
    teacherId,
    subject: subjectName,
    subjectId,
    date: createSlot.date,
    startTime,
    bookingType,
  };

  const handleSubmit = async () => {
    if (!valid) return;
    const existing = await detect.mutateAsync({ teacherId, date: createSlot.date, startTime });
    // มีคาบอยู่แล้วและไม่ใช่การลา → ห้ามจองทับ (UC-004)
    if (existing && existing.status !== "SICK_LEAVE") {
      setBlocked(existing);
      return;
    }
    // ช่องว่าง หรือ นักเรียนเดิมลา → สร้างได้ (จองทับคาบที่ลา)
    await create.mutateAsync(input);
    notify({
      title: existing ? "จองแทนคาบที่ลาแล้ว" : "สร้างการจองแล้ว",
      description: "สถานะ: รอยืนยัน",
      color: "success",
    });
    onClose();
  };

  // ── ช่องนี้มีการจองอยู่แล้ว (ไม่ใช่การลา) → จองทับไม่ได้ ──
  if (blocked) {
    return (
      <Stack gap="md">
        <Alert color="red" icon={<AlertTriangle size={18} />} title="ช่องนี้มีการจองอยู่แล้ว">
          {blocked.studentName} · {blocked.subject} ({blocked.startTime}) — จองทับได้เฉพาะกรณีที่
          นักเรียนคนเดิม<b>ลา</b>เท่านั้น
        </Alert>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={() => setBlocked(undefined)}>
            ย้อนกลับ
          </Button>
          <Button variant="light" color="gray" onClick={onClose}>
            ปิด
          </Button>
        </Group>
      </Stack>
    );
  }

  // ── ฟอร์มสร้างปกติ (+ แจ้งเมื่อกำลังจองทับคาบที่ลา) ──
  return (
    <Stack gap="md">
      {leaveOccupant && (
        <Alert color="orange" icon={<ArrowLeftRight size={18} />} title="จองแทนคาบที่นักเรียนลา">
          ช่องนี้ {leaveOccupant.studentName} ลา — การจองนี้จะเข้าไปแทนในช่องเวลาเดิม
        </Alert>
      )}
      <StudentSelect value={student} onChange={setStudent} required />
      <Select
        label="ครูผู้สอน"
        value={teacherId}
        onChange={(v) => {
          setTeacherId(v ?? "");
          setSubjectId("");
        }}
        data={teacherSelectData(teachers.filter((t) => bookableOnDate(t, createSlot.date)))}
        allowDeselect={false}
        renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="วิชา"
          value={subjectId || null}
          onChange={(v) => setSubjectId(v ?? "")}
          placeholder={subjectOptions.length ? "เลือกวิชา" : "โหลดครูก่อน"}
          data={subjectOptions.map((s) => ({ value: s.id, label: s.name }))}
          allowDeselect={false}
          required
          disabled={!subjectOptions.length}
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
        <Button
          color="blue"
          disabled={!valid}
          loading={create.isPending || detect.isPending}
          onClick={handleSubmit}
        >
          บันทึก
        </Button>
      </Group>
    </Stack>
  );
}
