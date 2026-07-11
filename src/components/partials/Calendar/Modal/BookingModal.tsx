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
import { useT } from "@/lib/i18n";
import {
  useConfirmBooking,
  useCreateBooking,
  useDetectConflict,
  useMarkAttended,
  useMarkSickLeave,
  useMoveBooking,
  useVouchers,
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
  const t = useT();
  const isCreate = !booking;
  const teacher = teachers.find((tc) => tc.id === (booking?.teacherId ?? createSlot?.teacherId));

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="lg"
      centered
      title={
        isCreate ? (
          <span className="font-semibold">{t("booking.addTitle", { date: createSlot?.date ?? "" })}</span>
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
  const t = useT();
  const confirm = useConfirmBooking();
  const attended = useMarkAttended();
  const sickLeave = useMarkSickLeave();

  const [moving, setMoving] = useState(false);

  const handleConfirm = async () => {
    const res = await confirm.mutateAsync(booking.id);
    const n = res.notification;
    if (n?.status === "queued") {
      notify({
        title: t("booking.confirmedTitle"),
        description: t("booking.confirmedLineSent"),
        color: "primary",
      });
    } else if (n?.status === "skipped") {
      notify({
        title: t("booking.confirmedTitle"),
        description: n.reason ?? t("booking.confirmedLineSkipped"),
        color: "warning",
      });
    } else {
      notify({
        title: t("booking.confirmedTitle"),
        description: t("booking.confirmedDefault"),
        color: "primary",
      });
    }
    onClose();
  };

  const handleSickLeave = async () => {
    const res = await sickLeave.mutateAsync(booking.id);
    if (res.locked) {
      notify({
        title: t("booking.leaveLockedTitle"),
        description: t("booking.leaveLockedDesc"),
        color: "danger",
      });
    } else if (res.extended) {
      notify({
        title: t("booking.leaveSavedTitle"),
        description: t("booking.leaveExtendedDesc", { date: res.extended.date }),
        color: "success",
      });
    } else {
      notify({ title: t("booking.leaveSavedTitle"), color: "default" });
    }
    onClose();
  };

  const handleAttended = async () => {
    await attended.mutateAsync(booking.id);
    notify({ title: t("booking.attendedTitle"), color: "success" });
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
        <Field label={t("booking.teacher")} value={teacherName} />
        <Field label={t("booking.subject")} value={booking.subject} />
        <Field label={t("booking.date")} value={booking.date} />
        <Field label={t("booking.time")} value={`${booking.startTime} - ${booking.endTime}`} />
      </dl>
      {booking.note && (
        <>
          <Divider />
          <p className="text-sm text-default-500">{t("booking.noteLabel")}: {booking.note}</p>
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
              {t("booking.overbookBtn")}
            </Button>
          )}
          {canMove && (
            <Button
              variant="light"
              color="grape"
              leftSection={<Move size={16} />}
              onClick={() => setMoving(true)}
            >
              {t("booking.moveBtn")}
            </Button>
          )}
        </Group>

        <Group gap="sm" wrap="wrap">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            variant="light"
            color="gray"
            leftSection={<CalendarX2 size={16} />}
            loading={sickLeave.isPending}
            onClick={handleSickLeave}
          >
            {t("booking.sickLeaveBtn")}
          </Button>
          <Button
            variant="light"
            color="green"
            leftSection={<BadgeCheck size={16} />}
            loading={attended.isPending}
            onClick={handleAttended}
          >
            {t("booking.attendBtn")}
          </Button>
          {booking.status === "PENDING" && (
            <Button
              color="blue"
              leftSection={<Bell size={16} />}
              loading={confirm.isPending}
              onClick={handleConfirm}
            >
              {t("booking.confirmBtn")}
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
  const t = useT();
  const move = useMoveBooking();
  const [teacherId, setTeacherId] = useState(booking.teacherId);
  const [date, setDate] = useState(booking.date);
  const [startTime, setStartTime] = useState(booking.startTime);

  const bookableTeachers = teachers.filter((tc) => bookableOnDate(tc, date));

  const handleSubmit = async () => {
    const patch: MoveBookingInput = {};
    if (teacherId !== booking.teacherId) patch.teacherId = teacherId;
    if (date !== booking.date) patch.date = date;
    if (startTime !== booking.startTime) patch.startTime = startTime;

    if (Object.keys(patch).length === 0) {
      notify({ title: t("booking.noChange"), color: "default" });
      onCancel();
      return;
    }

    try {
      await move.mutateAsync({ id: booking.id, patch });
      notify({
        title: t("booking.movedTitle"),
        description: `${date} ${startTime}`,
        color: "success",
      });
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiClientError && e.code === "SLOT_TAKEN"
          ? t("booking.moveSlotTaken")
          : e instanceof ApiClientError
            ? e.message
            : t("booking.moveFailGeneric");
      notify({ title: t("booking.moveFailTitle"), description: msg, color: "danger" });
    }
  };

  return (
    <Stack gap="md">
      <Alert color="grape" icon={<Move size={18} />} title={t("booking.moveTitle")}>
        {t("booking.moveHint")}
      </Alert>

      <Select
        label={t("booking.teacher")}
        value={teacherId}
        onChange={(v) => v && setTeacherId(v)}
        allowDeselect={false}
        data={teacherSelectData(bookableTeachers)}
        renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
      />
      <div className="grid grid-cols-2 gap-3">
        <DatePickerInput
          label={t("booking.date")}
          value={date}
          onChange={(v) => v && setDate(v)}
          valueFormat="D MMM YYYY"
          styles={{ input: { textAlign: "left" } }}
        />
        <Select
          label={t("booking.time")}
          value={startTime}
          onChange={(v) => v && setStartTime(v)}
          allowDeselect={false}
          data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
        />
      </div>

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" color="gray" onClick={onCancel}>
          {t("common.back")}
        </Button>
        <Button color="grape" loading={move.isPending} onClick={handleSubmit}>
          {t("booking.confirmMoveBtn")}
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
  const t = useT();
  const create = useCreateBooking();
  const detect = useDetectConflict();

  const [student, setStudent] = useState<StudentSelectValue | null>(null);
  const [teacherId, setTeacherId] = useState(createSlot.teacherId);
  const [subjectId, setSubjectId] = useState("");
  const [startTime, setStartTime] = useState(createSlot.time);
  const [bookingType, setBookingType] = useState<BookingType>("SINGLE_SESSION");
  const [voucherId, setVoucherId] = useState<string | null>(null);
  // ช่องที่ถูกจองอยู่แล้วและ "ไม่ใช่การลา" → จองทับไม่ได้ (UC-004)
  const [blocked, setBlocked] = useState<Booking | undefined>();

  const selectedTeacher = teachers.find((tc) => tc.id === teacherId);
  const subjectOptions = selectedTeacher?.subjectOptions ?? [];

  useEffect(() => {
    if (subjectOptions.length === 1) setSubjectId(subjectOptions[0].id);
  }, [teacherId, subjectOptions.length]);

  // วอยเชอร์ (UC-008): จองแบบ Voucher ต้องเลือกวอยเชอร์ของนักเรียนคนนั้น (มีชั่วโมงเหลือ+ไม่หมดอายุ)
  const isVoucher = bookingType === "VOUCHER";
  const { data: vouchers = [] } = useVouchers(student?.id, isVoucher && !!student?.id);
  const usableVouchers = vouchers.filter(
    (v) => v.remaining > 0 && v.expiryDate >= createSlot.date,
  );
  useEffect(() => {
    setVoucherId(null); // เปลี่ยนนักเรียน/ประเภท → ล้างวอยเชอร์ที่เลือก
  }, [student?.id, bookingType]);

  // นักเรียนเดิมที่ลาในช่องนี้ (ถ้ามี) — จองทับได้เฉพาะกรณีนี้
  const leaveOccupant = bookings.find(
    (b) =>
      b.teacherId === createSlot.teacherId &&
      b.date === createSlot.date &&
      b.startTime === createSlot.time &&
      b.status === "SICK_LEAVE",
  );

  const valid =
    student?.name.trim() && subjectId && teacherId && startTime && (!isVoucher || voucherId);

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
    voucherId: isVoucher ? voucherId ?? undefined : undefined,
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
      title: existing ? t("booking.overbookCreatedTitle") : t("booking.createdTitle"),
      description: t("booking.statusPending"),
      color: "success",
    });
    onClose();
  };

  // ── ช่องนี้มีการจองอยู่แล้ว (ไม่ใช่การลา) → จองทับไม่ได้ ──
  if (blocked) {
    return (
      <Stack gap="md">
        <Alert color="red" icon={<AlertTriangle size={18} />} title={t("booking.blockedTitle")}>
          {t("booking.blockedDesc", {
            student: blocked.studentName,
            subject: blocked.subject,
            time: blocked.startTime,
          })}
        </Alert>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={() => setBlocked(undefined)}>
            {t("common.back")}
          </Button>
          <Button variant="light" color="gray" onClick={onClose}>
            {t("common.close")}
          </Button>
        </Group>
      </Stack>
    );
  }

  // ── ฟอร์มสร้างปกติ (+ แจ้งเมื่อกำลังจองทับคาบที่ลา) ──
  return (
    <Stack gap="md">
      {leaveOccupant && (
        <Alert color="orange" icon={<ArrowLeftRight size={18} />} title={t("booking.overbookBannerTitle")}>
          {t("booking.overbookBannerDesc", { student: leaveOccupant.studentName })}
        </Alert>
      )}
      <StudentSelect value={student} onChange={setStudent} required />
      <Select
        label={t("booking.teacher")}
        value={teacherId}
        onChange={(v) => {
          setTeacherId(v ?? "");
          setSubjectId("");
        }}
        data={teacherSelectData(teachers.filter((tc) => bookableOnDate(tc, createSlot.date)))}
        allowDeselect={false}
        renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label={t("booking.subject")}
          value={subjectId || null}
          onChange={(v) => setSubjectId(v ?? "")}
          placeholder={subjectOptions.length ? t("booking.subjectPlaceholder") : t("booking.subjectPlaceholderNoTeacher")}
          data={subjectOptions.map((s) => ({ value: s.id, label: s.name }))}
          allowDeselect={false}
          required
          disabled={!subjectOptions.length}
        />
        <Select
          label={t("booking.time")}
          value={startTime}
          onChange={(v) => setStartTime(v ?? "")}
          data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
          allowDeselect={false}
        />
      </div>
      <Select
        label={t("booking.typeLabel")}
        value={bookingType}
        onChange={(v) => setBookingType((v ?? "SINGLE_SESSION") as BookingType)}
        data={BOOKING_TYPE_OPTIONS.map((k) => ({ value: k, label: t(`bookingType.${k}`) }))}
        allowDeselect={false}
      />

      {isVoucher && (
        <Select
          label={t("booking.voucherLabel")}
          value={voucherId}
          onChange={setVoucherId}
          placeholder={
            !student?.id
              ? t("booking.voucherPickStudentFirst")
              : usableVouchers.length
                ? t("booking.voucherPick")
                : t("booking.voucherNone")
          }
          data={usableVouchers.map((v) => ({
            value: v.id,
            label: t("booking.voucherOption", {
              hours: v.totalHours,
              remaining: v.remaining,
              expiry: v.expiryDate,
            }),
          }))}
          disabled={!student?.id || usableVouchers.length === 0}
          nothingFoundMessage={t("booking.voucherNone")}
          required
        />
      )}

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" color="gray" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          color="blue"
          disabled={!valid}
          loading={create.isPending || detect.isPending}
          onClick={handleSubmit}
        >
          {t("common.save")}
        </Button>
      </Group>
    </Stack>
  );
}
