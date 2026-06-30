"use client";

import { useState, useEffect } from "react";
import dayjs from "dayjs";
import {
  Modal,
  Button,
  Select,
  TextInput,
  Divider,
  Group,
  Stack,
  Alert,
  Paper,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { BadgeCheck, CalendarX2, Bell, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { BookingTypeChip, StatusChip } from "@/components/common/BookingBadges";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { notify } from "@/lib/ui/notify";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import {
  useCancelReschedule,
  useConfirmBooking,
  useConfirmReschedule,
  useCreateBooking,
  useCreateBookingWithReschedule,
  useDetectConflict,
  useMarkAttended,
  useMarkSickLeave,
} from "@/hooks/scheduler";
import type {
  Booking,
  BookingType,
  RescheduleReason,
  TeacherView,
} from "@/types/app/scheduler";
import type { CreateBookingInput } from "@/services/scheduler.service";
import { RESCHEDULE_REASON_LABEL, TIME_SLOTS } from "@/types/app/scheduler";
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
        <CreateForm createSlot={createSlot} teachers={teachers} onClose={onClose} />
      ) : booking ? (
        <ViewBooking
          booking={booking}
          teacherName={teacher?.name ?? "-"}
          teachers={teachers}
          bookings={bookings}
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
  bookings,
  onOverbook,
  onClose,
}: {
  booking: Booking;
  teacherName: string;
  teachers: TeacherView[];
  bookings: Booking[];
  onOverbook: (b: Booking) => void;
  onClose: () => void;
}) {
  const confirm = useConfirmBooking();
  const attended = useMarkAttended();
  const sickLeave = useMarkSickLeave();
  const confirmMove = useConfirmReschedule();
  const cancelMove = useCancelReschedule();

  const isRescheduling = booking.status === "PENDING_RESCHEDULE";
  const incoming = booking.incomingBookingId
    ? bookings.find((b) => b.id === booking.incomingBookingId)
    : undefined;
  const targetTeacher = booking.rescheduleTo
    ? teachers.find((t) => t.id === booking.rescheduleTo!.teacherId)
    : undefined;

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

  const handleConfirmMove = async () => {
    await confirmMove.mutateAsync(booking.id);
    notify({
      title: "ยืนยันการย้ายแล้ว",
      description: "ย้ายคาบเดิมไปช่องใหม่ และปล่อยช่องนี้ให้การจองใหม่",
      color: "success",
    });
    onClose();
  };

  const handleCancelMove = async () => {
    await cancelMove.mutateAsync(booking.id);
    notify({
      title: "ยกเลิกการย้าย",
      description: "คืนคาบเดิมไว้ที่เดิม และยกเลิกการจองใหม่",
      color: "default",
    });
    onClose();
  };

  // ── โหมดรอย้าย (จองทับ) ──
  if (isRescheduling && booking.rescheduleTo) {
    const t = booking.rescheduleTo;
    return (
      <Stack gap="md">
        <Alert color="orange" icon={<AlertTriangle size={18} />} title="รอผู้ปกครองตอบรับการย้าย">
          คาบนี้ถูกขอย้ายเพราะมีการจองทับ — ส่ง Line แจ้งผู้ปกครองแล้ว ของเดิมยังคาที่ช่องนี้จนกว่าจะยืนยัน
        </Alert>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="ครู (เดิม)" value={teacherName} />
          <Field label="คาบเดิม" value={`${booking.date} ${booking.startTime}`} />
          <Field label="วิธีย้าย" value={RESCHEDULE_REASON_LABEL[t.reason]} />
          <Field
            label="ปลายทาง"
            value={`${targetTeacher?.nickname ?? teacherName} · ${t.date} ${t.startTime}`}
          />
        </dl>

        {incoming && (
          <Paper withBorder p="sm" className="bg-default-100/60">
            <p className="text-xs text-default-400">การจองใหม่ที่รอช่องนี้</p>
            <p className="text-sm font-medium">
              {incoming.studentName} · {incoming.subject}
            </p>
          </Paper>
        )}

        <Group justify="flex-end" gap="sm" wrap="wrap">
          <Button variant="subtle" color="gray" onClick={onClose}>
            ปิด
          </Button>
          <Button
            variant="light"
            color="red"
            loading={cancelMove.isPending}
            onClick={handleCancelMove}
          >
            ยกเลิกการย้าย
          </Button>
          <Button color="green" loading={confirmMove.isPending} onClick={handleConfirmMove}>
            ผู้ปกครองตกลง — ยืนยันย้าย
          </Button>
        </Group>
      </Stack>
    );
  }

  // ── โหมดดูปกติ ──
  const canOverbook = !["CANCELLED", "PENDING_RESCHEDULE"].includes(booking.status);

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
        {canOverbook ? (
          <Button
            variant="light"
            color="orange"
            leftSection={<ArrowLeftRight size={16} />}
            onClick={() => onOverbook(booking)}
          >
            จองทับ (จัดการของเดิม)
          </Button>
        ) : (
          <span />
        )}

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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-default-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// ───────────────────────── Create form (+ conflict) ─────────────────────────

function CreateForm({
  createSlot,
  teachers,
  onClose,
}: {
  createSlot: { teacherId: string; time: string; date: string };
  teachers: TeacherView[];
  onClose: () => void;
}) {
  const create = useCreateBooking();
  const detect = useDetectConflict();
  const reschedule = useCreateBookingWithReschedule();

  const [studentName, setStudentName] = useState("");
  const [teacherId, setTeacherId] = useState(createSlot.teacherId);
  const [subjectId, setSubjectId] = useState("");
  const [startTime, setStartTime] = useState(createSlot.time);
  const [bookingType, setBookingType] = useState<BookingType>("SINGLE_SESSION");

  const selectedTeacher = teachers.find((t) => t.id === teacherId);
  const subjectOptions = selectedTeacher?.subjectOptions ?? [];

  useEffect(() => {
    if (subjectOptions.length === 1) setSubjectId(subjectOptions[0].id);
  }, [teacherId, subjectOptions.length]);

  // conflict state
  const [conflict, setConflict] = useState<Booking | undefined>();
  const [reason, setReason] = useState<RescheduleReason>("MOVE_DAY");
  const [targetDate, setTargetDate] = useState<string>(createSlot.date);
  const [targetTeacherId, setTargetTeacherId] = useState<string>(createSlot.teacherId);

  const valid = studentName.trim() && subjectId && teacherId && startTime;

  const subjectName =
    subjectOptions.find((s) => s.id === subjectId)?.name ??
    selectedTeacher?.subjects[0] ??
    "";

  const input: CreateBookingInput = {
    studentName: studentName.trim(),
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
    if (existing) {
      // มีคนจองช่องนี้แล้ว → เข้าโหมดจัดการของเดิม
      setConflict(existing);
      setReason("MOVE_DAY");
      setTargetDate(dayjs(existing.date).add(1, "day").format("YYYY-MM-DD"));
      setTargetTeacherId(existing.teacherId);
      return;
    }
    await create.mutateAsync(input);
    notify({ title: "สร้างการจองแล้ว", description: "สถานะ: รอยืนยัน", color: "success" });
    onClose();
  };

  const onReasonChange = (r: RescheduleReason) => {
    setReason(r);
    if (!conflict) return;
    if (r === "MOVE_DAY") setTargetDate(dayjs(conflict.date).add(1, "day").format("YYYY-MM-DD"));
    if (r === "MOVE_WEEK") setTargetDate(dayjs(conflict.date).add(1, "week").format("YYYY-MM-DD"));
    if (r === "MOVE_TEACHER") setTargetTeacherId(conflict.teacherId);
  };

  const handleReschedule = async () => {
    if (!conflict) return;
    await reschedule.mutateAsync({
      input,
      resolution: {
        reason,
        date: reason === "MOVE_TEACHER" ? conflict.date : targetDate,
        teacherId: reason === "MOVE_TEACHER" ? targetTeacherId : conflict.teacherId,
        startTime: conflict.startTime,
      },
    });
    notify({
      title: "ส่งคำขอย้ายแล้ว",
      description: "แจ้งผู้ปกครองทาง Line ของเดิมยังคาที่เดิมจนกว่าจะตอบรับ",
      color: "warning",
    });
    onClose();
  };

  // ── โหมดจัดการการจองทับ ──
  if (conflict) {
    const bookableTeachers = teachers.filter(
      (t) => bookableOnDate(t, conflict.date) && t.id !== conflict.teacherId,
    );
    return (
      <Stack gap="md">
        <Alert color="orange" icon={<AlertTriangle size={18} />} title="ช่องนี้มีการจองอยู่แล้ว">
          {conflict.studentName} · {conflict.subject} ({conflict.startTime}) — เลือกวิธีจัดการของเดิมก่อน
          ระบบจะแจ้งผู้ปกครองและรอตอบรับ
        </Alert>

        <Select
          label="ย้ายการจองเดิมไป"
          value={reason}
          onChange={(v) => v && onReasonChange(v as RescheduleReason)}
          allowDeselect={false}
          data={(Object.keys(RESCHEDULE_REASON_LABEL) as RescheduleReason[]).map((r) => ({
            value: r,
            label: RESCHEDULE_REASON_LABEL[r],
          }))}
        />

        {reason === "MOVE_TEACHER" ? (
          <Select
            label="ครูคนใหม่ (วัน-เวลาเดิม)"
            value={targetTeacherId}
            onChange={(v) => v && setTargetTeacherId(v)}
            allowDeselect={false}
            placeholder="เลือกครู"
            data={teacherSelectData(bookableTeachers)}
            renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
          />
        ) : (
          <DatePickerInput
            label="วันใหม่ (เวลาเดิม)"
            value={targetDate}
            onChange={(v) => v && setTargetDate(v)}
            valueFormat="D MMM YYYY"
            minDate={dayjs(conflict.date).add(1, "day").toDate()}
            styles={{ input: { textAlign: "left" } }}
          />
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={() => setConflict(undefined)}>
            ย้อนกลับ
          </Button>
          <Button
            color="orange"
            loading={reschedule.isPending}
            disabled={reason === "MOVE_TEACHER" && !targetTeacherId}
            onClick={handleReschedule}
          >
            ส่งคำขอย้าย + แจ้งผู้ปกครอง
          </Button>
        </Group>
      </Stack>
    );
  }

  // ── ฟอร์มสร้างปกติ ──
  return (
    <Stack gap="md">
      <TextInput
        label="ชื่อนักเรียน"
        value={studentName}
        onChange={(e) => setStudentName(e.currentTarget.value)}
        required
      />
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
