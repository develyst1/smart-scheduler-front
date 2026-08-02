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
  Menu,
  ActionIcon,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { BadgeCheck, CalendarX2, Bell, AlertTriangle, ArrowLeftRight, Move, MoreVertical, Search } from "lucide-react";
import { BookingTypeChip, StatusChip } from "@/components/common/BookingBadges";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import { notify } from "@/lib/ui/notify";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import {
  useBadges,
  useConfirmBooking,
  useCreateBooking,
  useDetectConflict,
  useEligibleStudents,
  useMarkAttended,
  useMarkSickLeave,
  useMoveBooking,
  useSetBookingBadges,
} from "@/hooks/scheduler";
import { badgeColorVar } from "@/lib/ui/badge-colors";
import type {
  Booking,
  BookingType,
  CourseContext,
  EligibleStudent,
  TeacherView,
  VoucherContext,
} from "@/types/app/scheduler";
import type { CreateBookingInput, MoveBookingInput } from "@/services/scheduler.service";
import { TIME_SLOTS } from "@/types/app/scheduler";

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
      size="xl"
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
  const setBadges = useSetBookingBadges();

  const [moving, setMoving] = useState(false);
  const [noticeError, setNoticeError] = useState<string | null>(null);

  // Editable badges (view mode): one value per active type, seeded from the booking.
  const { data: badgeTypes = [] } = useBadges();
  const activeBadgeTypes = badgeTypes.filter(
    (bt) => bt.active && bt.values.some((v) => v.active),
  );
  const seedBadges = () => {
    const m: Record<string, string | null> = {};
    for (const b of booking.badges ?? []) m[b.typeId] = b.valueId;
    return m;
  };
  const [badgeByType, setBadgeByType] = useState<Record<string, string | null>>(seedBadges);

  // Clear a stale advance-notice alert + reseed badges when a different booking is shown.
  useEffect(() => {
    setNoticeError(null);
    setBadgeByType(seedBadges());
  }, [booking.id]);

  const selectedBadgeIds = Object.values(badgeByType).filter((v): v is string => !!v);
  const initialBadgeIds = (booking.badges ?? []).map((b) => b.valueId);
  const badgesChanged =
    selectedBadgeIds.slice().sort().join(",") !== initialBadgeIds.slice().sort().join(",");

  const handleSaveBadges = async () => {
    await setBadges.mutateAsync({ bookingId: booking.id, badgeValueIds: selectedBadgeIds });
    notify({ title: t("badges.updated"), color: "success" });
    onClose();
  };

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

  const handleSickLeave = async (override = false) => {
    try {
      const res = await sickLeave.mutateAsync({ id: booking.id, override });
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
    } catch (err) {
      // UC-029: leave requested too late for this teacher type — offer an admin override.
      if (err instanceof ApiClientError && err.code === "LEAVE_NOTICE_TOO_LATE") {
        setNoticeError(err.message);
      } else {
        throw err;
      }
    }
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

      {activeBadgeTypes.length > 0 && (
        <>
          <Divider label={t("calendar.badge")} labelPosition="left" />
          <div className="grid grid-cols-2 gap-3">
            {activeBadgeTypes.map((bt) => {
              const colorOf = new Map(bt.values.map((v) => [v.id, v.color]));
              return (
                <Select
                  key={bt.id}
                  label={bt.name}
                  value={badgeByType[bt.id] ?? null}
                  onChange={(v) => setBadgeByType((prev) => ({ ...prev, [bt.id]: v }))}
                  data={bt.values
                    .filter((v) => v.active)
                    .map((v) => ({ value: v.id, label: v.label }))}
                  placeholder={t("booking.badgePlaceholder")}
                  clearable
                  searchable
                  renderOption={({ option }) => (
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: badgeColorVar(colorOf.get(option.value) ?? "gray") }}
                      />
                      {option.label}
                    </div>
                  )}
                />
              );
            })}
          </div>
          {badgesChanged && (
            <Button
              size="xs"
              variant="light"
              className="self-start"
              loading={setBadges.isPending}
              onClick={handleSaveBadges}
            >
              {t("booking.saveBadges")}
            </Button>
          )}
        </>
      )}

      <Divider />

      {noticeError && (
        <Alert
          color="orange"
          icon={<AlertTriangle size={16} />}
          title={t("booking.leaveNoticeTitle")}
        >
          {noticeError}
          <div className="mt-2">
            <Button
              size="xs"
              color="orange"
              variant="light"
              loading={sickLeave.isPending}
              onClick={() => {
                setNoticeError(null);
                void handleSickLeave(true);
              }}
            >
              {t("booking.leaveOverrideBtn")}
            </Button>
          </div>
        </Alert>
      )}

      {/* Close ซ้ายสุด · ปุ่มหลัก (Attended · Confirm) ขวา · คำสั่งจัดการอยู่ใน kebab ⋯
          จอแคบ: stack เต็มกว้าง, Confirm บนสุด (flex-col-reverse) */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <Button
          variant="subtle"
          color="gray"
          onClick={onClose}
          className="w-full sm:mr-auto sm:w-auto"
        >
          {t("common.close")}
        </Button>

        <Button
          variant="light"
          color="green"
          leftSection={<BadgeCheck size={16} />}
          loading={attended.isPending}
          onClick={handleAttended}
          className="w-full sm:w-auto"
        >
          {t("booking.attendBtn")}
        </Button>
        {booking.status === "PENDING" && (
          <Button
            color="blue"
            leftSection={<Bell size={16} />}
            loading={confirm.isPending}
            onClick={handleConfirm}
            className="w-full sm:w-auto"
          >
            {t("booking.confirmBtn")}
          </Button>
        )}

        <Menu position="top-end" withinPortal shadow="md" width={220}>
          <Menu.Target>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label={t("booking.moreActions")}
              className="w-full sm:w-auto"
            >
              <MoreVertical size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {canOverbook && (
              <Menu.Item
                color="orange"
                leftSection={<ArrowLeftRight size={16} />}
                onClick={() => onOverbook(booking)}
              >
                {t("booking.overbookBtn")}
              </Menu.Item>
            )}
            {canMove && (
              <Menu.Item
                color="grape"
                leftSection={<Move size={16} />}
                onClick={() => setMoving(true)}
              >
                {t("booking.moveBtn")}
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<CalendarX2 size={16} />}
              onClick={() => handleSickLeave()}
              disabled={booking.status === "SICK_LEAVE"}
            >
              {t("booking.sickLeaveBtn")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
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
  const teacherOff = !!teacherId && !bookableTeachers.some((tc) => tc.id === teacherId);

  // ย้ายไปวันที่ครูเดิมไม่ได้สอน → ล้างครู บังคับเลือกใหม่ (กันจองครูในวันหยุด)
  useEffect(() => {
    if (teacherOff) setTeacherId("");
  }, [teacherOff]);

  const handleSubmit = async () => {
    if (!teacherId) return;
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
        placeholder={t("booking.movePickTeacher")}
        value={teacherId || null}
        onChange={(v) => v && setTeacherId(v)}
        allowDeselect={false}
        searchable
        data={teacherSelectData(bookableTeachers)}
        renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
        error={!teacherId ? t("booking.moveTeacherOff") : undefined}
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
          searchable
          data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="subtle" color="gray" onClick={onCancel} className="w-full sm:w-auto">
          {t("common.back")}
        </Button>
        <Button
          color="grape"
          loading={move.isPending}
          disabled={!teacherId}
          onClick={handleSubmit}
          className="w-full sm:w-auto"
        >
          {t("booking.confirmMoveBtn")}
        </Button>
      </div>
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

// SPEC-017: booking type is the FIRST choice (tabs), then only the fields that type can use.
const BOOKING_TABS: BookingType[] = ["FIRST_TRIAL", "SINGLE_SESSION", "COURSE_PACKAGE", "VOUCHER"];

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

  const [bookingType, setBookingType] = useState<BookingType>("SINGLE_SESSION");
  // Trial / Single — free student picker + teacher + subject + time.
  const [student, setStudent] = useState<StudentSelectValue | null>(null);
  const [teacherId, setTeacherId] = useState(createSlot.teacherId);
  const [subjectId, setSubjectId] = useState("");
  /** SPEC-026 — the voucher's program, chosen not guessed. Empty until staff pick one. */
  const [voucherSubjectId, setVoucherSubjectId] = useState<string | null>(null);
  /** Server-side search for the eligible pickers (TASK-088) — a local filter can't match a parent phone. */
  const [eligibleSearch, setEligibleSearch] = useState("");
  const [debouncedEligible] = useDebouncedValue(eligibleSearch, 300);
  const [startTime, setStartTime] = useState(createSlot.time);
  // Course / Voucher — the selected entitlement (keyed by courseId/voucherId; one row per entitlement).
  const [entitlementId, setEntitlementId] = useState<string | null>(null);
  const [badgeByType, setBadgeByType] = useState<Record<string, string | null>>({});
  const { data: badgeTypes = [] } = useBadges();
  const activeBadgeTypes = badgeTypes.filter((bt) => bt.active && bt.values.some((v) => v.active));
  const [blocked, setBlocked] = useState<Booking | undefined>();
  // SPEC-017 #7: a student eligible TODAY can still be refused for a far-future date (e.g. voucher expires
  // before then). Surface that submit-time backend rejection clearly instead of a form that silently won't save.
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isCourse = bookingType === "COURSE_PACKAGE";
  const isVoucher = bookingType === "VOUCHER";
  const usesEligible = isCourse || isVoucher;

  const eligibleQ = debouncedEligible.trim() || undefined;
  const { data: courseStudents = [], isLoading: courseLoading } = useEligibleStudents(
    "COURSE_PACKAGE",
    isCourse,
    eligibleQ,
  );
  const { data: voucherStudents = [], isLoading: voucherLoading } = useEligibleStudents(
    "VOUCHER",
    isVoucher,
    eligibleQ,
  );
  const eligible: EligibleStudent[] = isCourse ? courseStudents : isVoucher ? voucherStudents : [];
  const eligibleLoading = isCourse ? courseLoading : voucherLoading;
  const entKey = (e: EligibleStudent) =>
    isCourse ? (e.context as CourseContext).courseId : (e.context as VoucherContext).voucherId;
  const selectedEligible = eligible.find((e) => entKey(e) === entitlementId) ?? null;

  const selectedTeacher = teachers.find((tc) => tc.id === teacherId);
  const subjectOptions = selectedTeacher?.subjectOptions ?? [];
  useEffect(() => {
    if (subjectOptions.length === 1) setSubjectId(subjectOptions[0].id);
  }, [teacherId, subjectOptions.length]);

  // A Voucher booking has no chosen teacher/slot (domain rule), so it lands in the slot the modal was opened
  // on. The **teacher** is a fact — it's the column that was clicked. The **subject never was**: this used to
  // read `subjectOptions[0]`, so a teacher coaching Surfskate/Skateboard/Inline recorded Surfskate every time.
  // 🔴 A defaulted value is a claim — `[0]` is a guess wearing a default's clothes (SPEC-026). It is now a
  // required choice, and there is no positional fallback anywhere in this file.
  const slotTeacher = teachers.find((tc) => tc.id === createSlot.teacherId);
  const slotSubjectOptions = slotTeacher?.subjectOptions ?? [];
  const voucherSubject = slotSubjectOptions.find((s) => s.id === voucherSubjectId) ?? null;

  const changeTab = (v: BookingType) => {
    setBookingType(v);
    setStudent(null);
    setEntitlementId(null);
    setSubmitError(null);
    setTeacherId(createSlot.teacherId);
    setStartTime(createSlot.time);
    setSubjectId("");
    setVoucherSubjectId(null);
    setEligibleSearch("");
  };

  // Preselect ONLY when there is exactly one thing to pick — and it still lands in state as a choice, so the
  // payload never reads an array position.
  useEffect(() => {
    if (isVoucher && slotSubjectOptions.length === 1) setVoucherSubjectId(slotSubjectOptions[0].id);
  }, [isVoucher, slotSubjectOptions.length]);

  const leaveOccupant = bookings.find(
    (b) =>
      b.teacherId === createSlot.teacherId &&
      b.date === createSlot.date &&
      b.startTime === createSlot.time &&
      b.status === "SICK_LEAVE",
  );

  const badgeValueIds = Object.values(badgeByType).filter((v): v is string => !!v);
  const trialSubjectName =
    subjectOptions.find((s) => s.id === subjectId)?.name ?? selectedTeacher?.subjects[0] ?? "";

  // Build the payload for the active tab. `POST /bookings` is unchanged (teacher/subject/time always required).
  let input: CreateBookingInput | null = null;
  let valid = false;
  if (isVoucher) {
    const ctx = selectedEligible?.context as VoucherContext | undefined;
    // Blocked until a program is chosen — same shape as TASK-076's collision picker: never offer a submit
    // that can only guess.
    valid = !!selectedEligible && !!ctx && !!createSlot.teacherId && !!voucherSubject && !!createSlot.time;
    if (selectedEligible && ctx && voucherSubject) {
      input = {
        studentName: selectedEligible.name,
        studentId: selectedEligible.id,
        teacherId: createSlot.teacherId,
        subject: voucherSubject.name,
        subjectId: voucherSubject.id,
        date: createSlot.date,
        startTime: createSlot.time,
        bookingType: "VOUCHER",
        voucherId: ctx.voucherId,
        badgeValueIds,
      };
    }
  } else if (isCourse) {
    const ctx = selectedEligible?.context as CourseContext | undefined;
    // Course keeps its own source — the course's subject is a fact. No positional fallback (SPEC-026);
    // if the course carries no subject, `valid` below refuses rather than inventing one.
    const subjId = ctx?.subject?.id ?? subjectId;
    const subjName = ctx?.subject?.name ?? trialSubjectName;
    valid = !!selectedEligible && !!teacherId && !!subjId && !!startTime;
    if (selectedEligible) {
      input = {
        studentName: selectedEligible.name,
        studentId: selectedEligible.id,
        teacherId,
        subject: subjName,
        subjectId: subjId,
        date: createSlot.date,
        startTime,
        bookingType: "COURSE_PACKAGE",
        courseId: ctx?.courseId,
        badgeValueIds,
      };
    }
  } else {
    valid = !!(student?.name.trim() && subjectId && teacherId && startTime);
    input = {
      studentName: student?.name.trim() ?? "",
      studentId: student?.id,
      studentPhone: student?.phone,
      teacherId,
      subject: trialSubjectName,
      subjectId,
      date: createSlot.date,
      startTime,
      bookingType,
      badgeValueIds,
    };
  }

  const handleSubmit = async () => {
    if (!valid || !input) return;
    setSubmitError(null);
    try {
      const existing = await detect.mutateAsync({
        teacherId: input.teacherId,
        date: input.date,
        startTime: input.startTime,
      });
      if (existing && existing.status !== "SICK_LEAVE") {
        setBlocked(existing);
        return;
      }
      await create.mutateAsync(input);
      notify({
        title: existing ? t("booking.overbookCreatedTitle") : t("booking.createdTitle"),
        description: t("booking.statusPending"),
        color: "success",
      });
      onClose();
    } catch (e) {
      // SPEC-017 #7: show the backend's specific rejection (e.g. "voucher expires before that date").
      if (e instanceof ApiClientError) setSubmitError(e.message);
      else throw e;
    }
  };

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

  const eligiblePlaceholder = eligibleLoading
    ? t("common.loading")
    : eligible.length
      ? t(isCourse ? "booking.pickCourseStudent" : "booking.pickVoucherStudent")
      : t(isCourse ? "booking.noCourseStudents" : "booking.noVoucherStudents");

  return (
    <Stack gap="md">
      <Tabs value={bookingType} onChange={(v) => v && changeTab(v as BookingType)}>
        <Tabs.List grow>
          {BOOKING_TABS.map((k) => (
            <Tabs.Tab key={k} value={k}>
              {t(`bookingType.${k}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {leaveOccupant && (
        <Alert color="orange" icon={<ArrowLeftRight size={18} />} title={t("booking.overbookBannerTitle")}>
          {t("booking.overbookBannerDesc", { student: leaveOccupant.studentName })}
        </Alert>
      )}

      {usesEligible ? (
        <>
          {/* Server-side search (TASK-088): name · nickname · **parent phone**. It cannot be Mantine's local
              `searchable`, because the payload carries no phone — a local filter would silently never match
              one, which is the complaint this exists to fix. */}
          <TextInput
            label={t("booking.student")}
            placeholder={t("booking.eligibleSearchPlaceholder")}
            value={eligibleSearch}
            onChange={(e) => setEligibleSearch(e.currentTarget.value)}
            leftSection={<Search size={16} />}
          />
          <Select
            placeholder={eligiblePlaceholder}
            data={eligible.map((e) => ({ value: entKey(e), label: e.nickname || e.name }))}
            value={entitlementId}
            onChange={setEntitlementId}
            disabled={!eligible.length}
            nothingFoundMessage={eligiblePlaceholder}
            required
          />

          {/* 🔴 SPEC-026 — the voucher's program, chosen. Blocks submit until answered. */}
          {isVoucher &&
            (slotSubjectOptions.length === 0 ? (
              <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light">
                {t("booking.voucherNoProgram", { teacher: slotTeacher?.nickname ?? "-" })}
              </Alert>
            ) : (
              <Select
                label={t("booking.voucherProgram")}
                description={t("booking.voucherProgramHint")}
                placeholder={t("booking.pickProgram")}
                data={slotSubjectOptions.map((s) => ({ value: s.id, label: s.name }))}
                value={voucherSubjectId}
                onChange={setVoucherSubjectId}
                allowDeselect={false}
                searchable
                required
              />
            ))}

          {selectedEligible && isCourse && (
            <ContextCard
              text={t("booking.courseContext", {
                subject: (selectedEligible.context as CourseContext).subject?.name ?? "-",
                used: (selectedEligible.context as CourseContext).usedSessions,
                size: (selectedEligible.context as CourseContext).size,
                leaveUsed: (selectedEligible.context as CourseContext).leaveUsed,
                leaveQuota: (selectedEligible.context as CourseContext).leaveQuota,
                expiry: (selectedEligible.context as CourseContext).expiryDate,
              })}
            />
          )}
          {selectedEligible && isVoucher && (
            <ContextCard
              text={t("booking.voucherContext", {
                remaining: (selectedEligible.context as VoucherContext).remainingHours,
                expiry: (selectedEligible.context as VoucherContext).expiryDate,
              })}
            />
          )}

          {isVoucher ? (
            <Alert variant="light" color="blue">
              <Text fz="sm">
                {t("booking.voucherNoSlot", {
                  teacher: slotTeacher?.nickname ?? "-",
                  time: createSlot.time,
                })}
              </Text>
            </Alert>
          ) : (
            // Course: teacher + time (subject comes from the course). Teacher defaults to the clicked column.
            <div className="grid grid-cols-2 gap-3">
              <Select
                label={t("booking.teacher")}
                value={teacherId}
                onChange={(v) => setTeacherId(v ?? "")}
                data={teacherSelectData(teachers.filter((tc) => bookableOnDate(tc, createSlot.date)))}
                allowDeselect={false}
                searchable
                renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
              />
              <Select
                label={t("booking.time")}
                value={startTime}
                onChange={(v) => setStartTime(v ?? "")}
                data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
                allowDeselect={false}
                searchable
              />
            </div>
          )}
        </>
      ) : (
        <>
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
            searchable
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
              searchable
              required
              disabled={!subjectOptions.length}
            />
            <Select
              label={t("booking.time")}
              value={startTime}
              onChange={(v) => setStartTime(v ?? "")}
              data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
              allowDeselect={false}
              searchable
            />
          </div>
        </>
      )}

      {activeBadgeTypes.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {activeBadgeTypes.map((bt) => {
            const colorOf = new Map(bt.values.map((v) => [v.id, v.color]));
            return (
              <Select
                key={bt.id}
                label={bt.name}
                value={badgeByType[bt.id] ?? null}
                onChange={(v) => setBadgeByType((prev) => ({ ...prev, [bt.id]: v }))}
                data={bt.values.filter((v) => v.active).map((v) => ({ value: v.id, label: v.label }))}
                placeholder={t("booking.badgePlaceholder")}
                clearable
                searchable
                renderOption={({ option }) => (
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: badgeColorVar(colorOf.get(option.value) ?? "gray") }}
                    />
                    {option.label}
                  </div>
                )}
              />
            );
          })}
        </div>
      )}

      {submitError && (
        <Alert color="red" icon={<AlertTriangle size={16} />} title={t("booking.dateRejectedTitle")}>
          {submitError}
        </Alert>
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

function ContextCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-default-200 bg-default-50 px-3 py-2">
      <Text fz="sm">{text}</Text>
    </div>
  );
}
