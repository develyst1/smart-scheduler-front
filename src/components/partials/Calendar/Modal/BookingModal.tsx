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
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Switch,
  TextInput,
  Loader,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { BadgeCheck, Ban, CalendarX2, Bell, AlertTriangle, ArrowLeftRight, Move, MoreVertical, PackageOpen } from "lucide-react";
import { BookingTypeChip, StatusChip } from "@/components/common/BookingBadges";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import EligibleStudentSelect from "@/components/common/EligibleStudentSelect";
import { notify } from "@/lib/ui/notify";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { ApiClientError, errorProblems } from "@/lib/api/client";
import DiscountSection from "@/components/common/DiscountSection";
import AttendeeNoteInput from "@/components/common/AttendeeNoteInput";
import { discountPayload, emptyDiscount, evaluateDiscount, type DiscountDraft } from "@/lib/scheduler/discount";
import { useT } from "@/lib/i18n";
import {
  useBadges,
  useCatalogItems,
  useConfirmBooking,
  useCreateBooking,
  useDetectConflict,
  useEligibleStudents,
  useMarkAttended,
  useMarkSickLeave,
  useMoveBooking,
  useSellablePackages,
  useSetBookingBadges,
} from "@/hooks/scheduler";
import { packageFor, voucherAllowsSubject } from "@/lib/scheduler/sellable";
import { eligibleLabel, entKey, type EligibleType } from "@/lib/scheduler/eligible";
import {
  emptyOtherBooking,
  evaluateOtherBooking,
  onOtherChargeToggle,
  onOtherConsumeToggle,
  onOtherTitleChange,
  type OtherBookingDraft,
  type OtherPriceSource,
} from "@/lib/scheduler/other-booking";
import { formatPriceMinor } from "@/types/app/pricing";
import RentalModal from "@/components/partials/Rental/RentalModal";
import CancelBookingDialog from "./CancelBookingDialog";
import { useConfirm } from "@/components/common/useConfirm";
import { badgeColorVar } from "@/lib/ui/badge-colors";
import type {
  Booking,
  BookingType,
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
            {/* AC-10 — the booking's own name, from the BE's one `displayName`. No local fallback. */}
            <span className="font-semibold">{booking.displayName}</span>
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
  // REQ-028 / TASK-109 — record an equipment rental as an add-on to this booking (refId = booking.id).
  const [rentalOpen, setRentalOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // REQ-073 — one shared confirm for the actions that consume a session, message a teacher, or charge.
  const { confirm: askConfirm, confirmDialog } = useConfirm();

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
    // REQ-073 (2) — this sends a LINE to the teacher. Reaching a human is not undoable by clicking again.
    //
    // 🔴 DEF-6 / TASK-241 — and it must name EVERY teacher it is about to message. The BE already fans the
    // send out (`assignedTeacherIds` → one outbox row each); only this sentence under-reported it. Confirming
    // is the moment an admin chooses to message people, so a dialog naming one of two is asking them to
    // approve something other than what happens.
    //
    // 🚫 The names come from `booking.teachers` — the ONE accessor TASK-224 put on the DTO and TASK-227
    // already renders in the cell. Never re-derived from the teacher roster or from `teacherId`.
    // The single-teacher path is deliberately left on `teacherName` and `confirmMsg`, byte-identical to
    // before: the four existing types must not see a changed dialog.
    const assigned = booking.teachers ?? [];
    const message =
      assigned.length > 1
        ? t("confirmAction.confirmMsgMulti", {
            n: assigned.length,
            teachers: assigned.map((tc) => tc.nickname || tc.name).join(", "),
          })
        : t("confirmAction.confirmMsg", { teacher: teacherName });
    if (
      !(await askConfirm({
        title: t("confirmAction.confirmTitle"),
        message,
        confirmLabel: t("booking.confirmBtn"),
        color: "blue",
      }))
    )
      return;
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
    // REQ-073 (1) — consumes leave quota and appends a make-up; both are work to unpick.
    if (
      !(await askConfirm({
        title: t("confirmAction.leaveTitle"),
        message: t("confirmAction.leaveMsg"),
        confirmLabel: t("booking.sickLeaveBtn"),
        color: "orange",
      }))
    )
      return;
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
    // 🔴 REQ-073 — the LIGHT variant, deliberately. On 2026-08-23 fifteen real sessions went NO_SHOW because
    // staff pressed confirm and never pressed มาเรียน; we need this pressed MORE, so the confirm costs a
    // keystroke (focused button, Enter) and not a read. No reason field, one line.
    if (
      !(await askConfirm({
        title: t("confirmAction.attendTitle"),
        confirmLabel: t("booking.attendBtn"),
        light: true,
      }))
    )
      return;
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
  // REQ-074 + TASK-220 — cancel-with-reason covers the NON-course types: 1HR, voucher, 1st Trial and (TASK-227 /
  // REQ-078) อื่นๆ. A course session is still cancelled from its PLAN (TASK-105), where the re-owe/make-up
  // consequence is visible; offering it here too would be a second door to a different behaviour.
  //
  // ⛔ This list and the BE's `REASON_ENUM_REQUIRED` (`scheduler.service.ts`) are ONE RULE IN TWO FILES and must
  // ship together — the pairing TASK-220 established and TASK-224/227 extended with `OTHER`. The dialog forces a
  // reason; the BE only STORES one for the types in its set, and REFUSES the cancel with `REASON_REQUIRED` for
  // the types in its set that this list omits. Either half alone is a defect:
  //   · FE ahead of BE → staff pick a reason the server discards; the record looks complete and is empty.
  //   · BE ahead of FE → the dialog never asks, the API refuses, and the button silently does nothing —
  //     precisely the failure the owner rejected REQ-019 acceptance for.
  // A test on the BE side asserts its comment names `canCancelWithReason`, so editing one list puts the other
  // one grep away.
  const canCancelWithReason =
    (booking.bookingType === "SINGLE_SESSION" ||
      booking.bookingType === "VOUCHER" ||
      booking.bookingType === "FIRST_TRIAL" ||
      booking.bookingType === "OTHER") &&
    booking.status !== "CANCELLED";

  return (
    <Stack gap="md">
      {/* Details + note as ONE tight group (gap-2.5) so the session note reads as part of the booking, not a
          detached block floating below it. */}
      <div className="flex flex-col gap-1.5">
      <dl className="grid grid-cols-2 gap-2.5 text-sm">
        {/* AC-18 — an อื่นๆ booking can carry several teachers, and the modal is where staff confirm WHO. One
            booking, so one field listing all of them; `teachers` is length 1 for the four lesson types, which
            leaves their tile reading exactly as before. */}
        <Field
          label={t("booking.teacher")}
          value={
            booking.teachers.length > 1
              ? booking.teachers.map((tc) => tc.nickname || tc.name).join(", ")
              : teacherName
          }
        />
        {/* AC-15 — an อื่นๆ booking has NO program. The tile is omitted rather than rendered empty: a labelled
            field with nothing in it reads as information that went missing (TASK-219's lesson). */}
        {booking.subject && <Field label={t("booking.subject")} value={booking.subject} />}
        <Field label={t("booking.date")} value={booking.date} />
        <Field label={t("booking.time")} value={`${booking.startTime} - ${booking.endTime}`} />
      </dl>
      {/* REQ-063 req 8 / AC-10 — a discount that lives only in the DB doesn't make "what and why" answerable.
          Shown on the record wherever staff look at the booking. `value` is the human number (a percentage, or
          whole baht), so it is rendered as typed — no conversion here; the money itself belongs to the ledger.
          `actor` is deliberately NOT shown: one shared login today makes it honest-but-useless, and a meaningless
          name reads as an answer to "who" when it isn't (SA note on Part 2). */}
      {booking.discount && (
        <>
          <p className="text-sm tabular-nums">
            {t("discount.section")}:{" "}
            <strong>
              {booking.discount.kind === "PERCENT"
                ? t("discount.recordedPercent", { value: booking.discount.value })
                : t("discount.recordedBaht", { value: booking.discount.value })}
            </strong>
            {" · "}
            <span className="text-muted-500">
              {t("discount.reason")}: {booking.discount.reason}
            </span>
          </p>
        </>
      )}

      {/* REQ-068 — the session note, shown where staff look at the booking. Rendered as a neutral-bordered callout
          (matching the calendar cell) so it reads as a note. Distinct from the status `note` below it, which the
          cancel/leave flows write. Empty ⇒ nothing rendered (AC-5). */}
      {booking.attendeeNote && (
        <div className="rounded-r-lg border-l-2 border-warning bg-warning/10 py-1.5 pl-2.5 pr-3 text-sm">
          <span className="block text-xs font-medium text-warning">{t("attendeeNote.label")}</span>
          <span className="text-muted-700">{booking.attendeeNote}</span>
        </div>
      )}

      {booking.note && (
        <p className="text-sm text-muted-500">{t("booking.noteLabel")}: {booking.note}</p>
      )}
      </div>

      {activeBadgeTypes.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-500">{t("calendar.badge")}</span>
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
        </div>
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
          variant="default"
          leftSection={<BadgeCheck size={16} className="text-success" />}
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
            {canCancelWithReason && (
              <Menu.Item
                color="red"
                leftSection={<Ban size={16} />}
                onClick={() => setCancelOpen(true)}
              >
                {t("cancelBooking.action")}
              </Menu.Item>
            )}
            <Menu.Item leftSection={<PackageOpen size={16} />} onClick={() => setRentalOpen(true)}>
              {t("rental.addonBtn")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      {/* REQ-074 — placement: the booking detail's ⋯ menu, beside sick-leave/move. See the task notes. */}
      {confirmDialog}
      <CancelBookingDialog
        opened={cancelOpen}
        booking={booking}
        onClose={() => setCancelOpen(false)}
        onCancelled={onClose}
      />
      {/* The rental is logged against the BOOKING, so it is named by what the booking is called. */}
      <RentalModal
        opened={rentalOpen}
        onClose={() => setRentalOpen(false)}
        refId={booking.id}
        contextName={booking.displayName}
      />
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
  // Tile (option B): a light fill with no border guides the eye field-by-field, and reads as read-only info —
  // distinct from the bordered badge selects, which are editable.
  return (
    <div className="rounded-lg bg-muted-50 px-3 py-2">
      <dt className="text-xs text-muted-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// ───────────────────────── Create form (+ จองทับคนลา) ─────────────────────────

// SPEC-017: booking type is the FIRST choice (tabs), then only the fields that type can use.
// SPEC-047 (REQ-044, option C) — the COURSE tab is gone. It did a plain `createBooking` (+1 session, no owed
// check → could over-fill a course to size+1); its real job, the make-up insert, lives on the plan modal
// (`แทรกคาบชดเชย`, owed-gated) and paid-extra on Single / `เพิ่มคาบ(คิดเงิน)`. Removing it loses no capability.
//
// ⚠️ Hand-written, like `BOOKING_TYPE_OPTIONS` and the legend array — widening `BookingType` adds no tab and
// the compiler says nothing. `OTHER` (SPEC-070 / TASK-226) is added here explicitly, and it is last on purpose:
// it is not a product, and it should not sit among the four things the school sells.
const BOOKING_TABS: BookingType[] = ["FIRST_TRIAL", "SINGLE_SESSION", "VOUCHER", "OTHER"];

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
  // REQ-063 — a discount on the two booking types that actually post revenue.
  const [discount, setDiscount] = useState<DiscountDraft>(emptyDiscount());
  const [discountProblems, setDiscountProblems] = useState<string[]>([]);
  // REQ-068 — optional on every booking type; empty sends nothing and changes nothing (AC-5).
  const [attendeeNote, setAttendeeNote] = useState("");
  // SPEC-070 / REQ-078 — the อื่นๆ branch. All of its RULES live in `lib/scheduler/other-booking.ts`; this is
  // only the draft the controls edit.
  const [other, setOther] = useState<OtherBookingDraft>(() => emptyOtherBooking(createSlot.teacherId));

  const isVoucher = bookingType === "VOUCHER";
  const isOther = bookingType === "OTHER";
  // SPEC-047 — voucher is now the ONLY entitlement-backed tab; the alias stays so the branch below reads by intent.
  // อื่นๆ deliberately does NOT use it: its student is a free picker (or absent), and its optional deduction is a
  // second, separate question about that student — not a way of choosing them.
  const usesEligible = isVoucher;

  const eligibleType: EligibleType = "VOUCHER";
  // SPEC-039 — `EligibleStudentSelect` owns the **searched** query (it is the one control staff type into).
  // This unsearched query is only the superset the form resolves the *selected* entitlement from, for the
  // ContextCard and the payload. Safe because `GET /students/eligible` is unpaged by design (a row found by
  // search is always present here too) — see the BE's "paging this would silently truncate" note.
  const { data: voucherStudents = [] } = useEligibleStudents("VOUCHER", isVoucher);
  const eligible: EligibleStudent[] = isVoucher ? voucherStudents : [];

  // ── SPEC-070 / TASK-226 — the อื่นๆ branch's own data ──
  // The optional deduction needs THIS student's entitlements, so both lists are fetched and filtered by student
  // id. Only an EXISTING student can hold one — a name typed into `StudentSelect` has no id and no entitlements,
  // which is why the gate below is `student?.id` and not `student`.
  const consumeEnabled = isOther && other.consume && !!student?.id;
  const { data: otherCourseElig = [] } = useEligibleStudents("COURSE_PACKAGE", consumeEnabled);
  const { data: otherVoucherElig = [] } = useEligibleStudents("VOUCHER", consumeEnabled);
  const consumeOptions = [
    ...otherCourseElig
      .filter((e) => e.id === student?.id)
      .map((e) => ({
        value: `course:${entKey(e, "COURSE_PACKAGE")}`,
        label: eligibleLabel(e, "COURSE_PACKAGE", otherCourseElig),
      })),
    ...otherVoucherElig
      .filter((e) => e.id === student?.id)
      .map((e) => ({
        value: `voucher:${entKey(e, "VOUCHER")}`,
        label: eligibleLabel(e, "VOUCHER", otherVoucherElig),
      })),
  ];
  // Only fetched while the charge toggle is on AND the item source is chosen — opening the form on a lesson
  // type queries nothing.
  const catalog = useCatalogItems(isOther && other.charge && other.priceSource === "ITEM");

  // 🔴 `hasStudent` is DERIVED at every read, never stored-and-synced: a copy of the student's presence inside
  // the draft is one `setState` away from disagreeing with the picker, and the rule it feeds (AC-10 — no
  // student ⇒ a title is mandatory) is exactly the one that must not go stale.
  const otherDraft: OtherBookingDraft = { ...other, hasStudent: !!student?.name.trim() };
  const otherEval = evaluateOtherBooking(otherDraft);
  const selectedEligible = eligible.find((e) => entKey(e, eligibleType) === entitlementId) ?? null;

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
  // SPEC-030/TASK-106 (b, FE): a voucher can't book Onewheel / Balance Play — omit the excluded programs from the
  // picker, driven by the exposed `voucherAllowedGroups` (never a hardcoded list). Course bookings are unaffected.
  const { data: sellable } = useSellablePackages();
  // REQ-063 — the full price a discount applies to, mirroring exactly what the BE prices each type from
  // (`revenueItemRef`): a SINGLE session from the card's `size: 1` package for the chosen program, a FIRST_TRIAL
  // from the `first-trial` sale item — now on the wire as `firstTrialPriceMinor` (TASK-164, cut after I raised the
  // gap). Both come from the server's one price authority; the FE still holds no copy of the price card.
  const singleFullMinor =
    bookingType === "SINGLE_SESSION"
      ? (packageFor(sellable, subjectId, 1)?.priceMinor ?? 0)
      : bookingType === "FIRST_TRIAL"
        ? (sellable?.firstTrialPriceMinor ?? 0)
        : 0;
  const singleDiscountEval = evaluateDiscount(discount, singleFullMinor);
  const voucherSubjectOptions = slotSubjectOptions.filter((s) => voucherAllowsSubject(sellable, s.id));
  const voucherSubject = voucherSubjectOptions.find((s) => s.id === voucherSubjectId) ?? null;

  const changeTab = (v: BookingType) => {
    setBookingType(v);
    setStudent(null);
    setEntitlementId(null);
    setSubmitError(null);
    setTeacherId(createSlot.teacherId);
    setStartTime(createSlot.time);
    setSubjectId("");
    setVoucherSubjectId(null);
    setDiscount(emptyDiscount());
    setDiscountProblems([]);
    setAttendeeNote("");
    setOther(emptyOtherBooking(createSlot.teacherId));
  };

  // Preselect ONLY when there is exactly one thing to pick — and it still lands in state as a choice, so the
  // payload never reads an array position.
  useEffect(() => {
    if (isVoucher && voucherSubjectOptions.length === 1) setVoucherSubjectId(voucherSubjectOptions[0].id);
  }, [isVoucher, voucherSubjectOptions.length]);

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
    valid = !!selectedEligible && !!ctx && !!createSlot.teacherId && !!voucherSubject && !!startTime;
    if (selectedEligible && ctx && voucherSubject) {
      input = {
        studentName: selectedEligible.name,
        studentId: selectedEligible.id,
        teacherId: createSlot.teacherId,
        subject: voucherSubject.name,
        subjectId: voucherSubject.id,
        date: createSlot.date,
        // SPEC-040 — the voucher session's time is now a CHOICE, not the row that was clicked. The
        // teacher stays `createSlot.teacherId`: the domain rule is "a voucher can't pick a **teacher**",
        // which never said anything about the time.
        startTime,
        bookingType: "VOUCHER",
        voucherId: ctx.voucherId,
        badgeValueIds,
        attendeeNote: attendeeNote.trim() || undefined,
      };
    }
  } else if (isOther) {
    // SPEC-070 / REQ-078 — every RULE is in `evaluateOtherBooking`; this branch only shapes the payload.
    const [firstTeacher, ...additional] = otherDraft.teacherIds;
    valid = otherEval.problemKeys.length === 0 && !!firstTeacher && !!startTime;
    if (firstTeacher) {
      const ent = otherDraft.consume ? (otherDraft.entitlementId ?? "") : "";
      input = {
        // Both empty when there is no student — `createBooking` then omits `student` entirely rather than
        // asking the BE to find-or-create a nameless guardian.
        studentName: student?.name.trim() ?? "",
        studentId: student?.id,
        studentPhone: student?.phone,
        teacherId: firstTeacher,
        // 🔴 An อื่นๆ booking has NO program. `subject`/`subjectId` stay empty and `createBooking` skips
        // `resolveSubjectId` for this type — that helper throws when it cannot resolve a name, which would
        // refuse every อื่นๆ booking client-side before the request was made.
        subject: "",
        subjectId: undefined,
        date: createSlot.date,
        startTime,
        bookingType: "OTHER",
        // "Consume" IS "set courseId/voucherId" — the same field the day-end engine already deducts from
        // (SPEC-070 §AC-7/8: nothing new to build, only to validate).
        courseId: ent.startsWith("course:") ? ent.slice("course:".length) : undefined,
        voucherId: ent.startsWith("voucher:") ? ent.slice("voucher:".length) : undefined,
        badgeValueIds,
        attendeeNote: attendeeNote.trim() || undefined,
        // 🚫 No `discount` — the server refuses one on อื่นๆ (SPEC-070 §Out of scope); a typed amount already
        // lets staff charge whatever they mean to.
        otherTitle: otherEval.otherTitle,
        otherPriceMinor: otherEval.otherPriceMinor,
        otherPriceItemId: otherEval.otherPriceItemId,
        additionalTeacherIds: additional,
      };
    }
  } else {
    valid =
      !!(student?.name.trim() && subjectId && teacherId && startTime) &&
      singleDiscountEval.problemKeys.length === 0;
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
      discount: discountPayload(discount, singleFullMinor),
      attendeeNote: attendeeNote.trim() || undefined,
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
      // REQ-063 — DISCOUNT_REFUSED returns an ARRAY; render every entry, not just the headline message.
      setDiscountProblems(errorProblems(e));
      if (e instanceof ApiClientError) setSubmitError(e.message);
      else throw e;
    }
  };

  if (blocked) {
    return (
      <Stack gap="md">
        <Alert color="red" icon={<AlertTriangle size={18} />} title={t("booking.blockedTitle")}>
          {/* TASK-227 — the slot's current occupant, named by what THAT booking is called: it may well be an
              อื่นๆ block with no student and no program, which is precisely a reason the slot is unavailable.
              `subject` falls back to the type's word rather than an empty gap in the middle of a sentence. */}
          {t("booking.blockedDesc", {
            student: blocked.displayName,
            subject: blocked.subject ?? t(`bookingType.${blocked.bookingType}`),
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
          {t("booking.overbookBannerDesc", { student: leaveOccupant.displayName })}
        </Alert>
      )}

      {usesEligible ? (
        <>
          {/* SPEC-039 — ONE field, the same control the Trial/Single tabs use. The server-side search
              (TASK-088: name · nickname · **parent phone**) lives inside it; it cannot be Mantine's local
              `searchable`, because the payload carries no phone — a local filter would silently never match
              one, which is the complaint that search exists to fix. */}
          <EligibleStudentSelect
            type={eligibleType}
            value={entitlementId}
            onChange={setEntitlementId}
            required
          />

          {/* 🔴 SPEC-026 — the voucher's program, chosen. Blocks submit until answered. */}
          {isVoucher &&
            (voucherSubjectOptions.length === 0 ? (
              <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light">
                {t(
                  slotSubjectOptions.length === 0
                    ? "booking.voucherNoProgram"
                    : "booking.voucherNoAllowedProgram",
                  { teacher: slotTeacher?.nickname ?? "-" },
                )}
              </Alert>
            ) : (
              <Select
                label={t("booking.voucherProgram")}
                description={t("booking.voucherProgramHint")}
                placeholder={t("booking.pickProgram")}
                data={voucherSubjectOptions.map((s) => ({ value: s.id, label: s.name }))}
                value={voucherSubjectId}
                onChange={setVoucherSubjectId}
                allowDeselect={false}
                searchable
                required
              />
            ))}

          {selectedEligible && (
            <ContextCard
              text={t("booking.voucherContext", {
                remaining: (selectedEligible.context as VoucherContext).remainingHours,
                expiry: (selectedEligible.context as VoucherContext).expiryDate,
              })}
            />
          )}

          {/* SPEC-040 — the time is a field, not a fact stated back at staff. What stays informational is the one
              thing that really is fixed: a voucher doesn't pick a teacher, so the session is with the clicked
              column's teacher. (The course teacher/time row that used to be the other half of this fork went with
              the COURSE tab — SPEC-047.) */}
          <Alert variant="light" color="blue">
            <Text fz="sm">
              {t("booking.voucherNoTeacherPick", { teacher: slotTeacher?.nickname ?? "-" })}
            </Text>
          </Alert>
          <Select
            label={t("booking.time")}
            placeholder={t("booking.pickTime")}
            value={startTime}
            onChange={(v) => setStartTime(v ?? "")}
            data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
            allowDeselect={false}
            searchable
            required
          />
        </>
      ) : isOther ? (
        /* ── SPEC-070 / REQ-078 — the อื่นๆ form. Deliberately NOT the lesson layout: no program picker (there
           is no program), the student is optional, and the teacher control is a multi-select. ── */
        <>
          {/* AC-19 — at least one teacher; several allowed for อื่นๆ only (owner: "ทุกการจองต้องมีครู … อาจจะ
              ครูหลายคนได้"). The clicked column is pre-filled as a fact, not a guess, and staff may swap it. */}
          <MultiSelect
            label={t("booking.otherTeachers")}
            description={t("booking.otherTeachersHint")}
            placeholder={t("booking.movePickTeacher")}
            data={teacherSelectData(teachers.filter((tc) => bookableOnDate(tc, createSlot.date)))}
            value={other.teacherIds}
            onChange={(v) => setOther((p) => ({ ...p, teacherIds: v }))}
            searchable
            required
            renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
          />

          <StudentSelect value={student} onChange={setStudent} label={t("booking.otherStudentOptional")} />

          {/* AC-10 — always shown for อื่นๆ, mandatory only when there is no student. It is the ONLY thing left
              to name the booking with, and `displayName` must never fall through to blank or to the word อื่นๆ. */}
          <TextInput
            label={t("booking.otherTitle")}
            description={t("booking.otherTitleHint")}
            placeholder={t("booking.otherTitlePlaceholder")}
            value={other.title}
            onChange={onOtherTitleChange(setOther)}
            required={!otherDraft.hasStudent}
          />

          <Select
            label={t("booking.time")}
            value={startTime}
            onChange={(v) => setStartTime(v ?? "")}
            data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
            allowDeselect={false}
            searchable
            className="max-w-xs"
          />

          {/* ── Charge (AC-5/6/11/12) — off by default. ✅ Stays available with several teachers: the owner's
              "ไม่ต้องมีให้ใส่การได้ตังค์" was about TEACHER PAY (Q7 = ก), not the customer charge. ── */}
          <div className="rounded-lg border border-muted-200 p-3">
            <Switch
              label={t("booking.otherCharge")}
              checked={other.charge}
              onChange={onOtherChargeToggle(setOther)}
            />
            {other.charge && (
              <Stack gap="sm" mt="sm">
                {/* 🔴 AC-12 — ONE value, so "both price sources set" is unrepresentable rather than merely
                    refused. The DB CHECK and the server refusal are the backstops; this is the product. */}
                <SegmentedControl
                  fullWidth
                  value={other.priceSource}
                  onChange={(v) =>
                    setOther((p) => ({ ...p, priceSource: v as OtherPriceSource }))
                  }
                  data={[
                    { value: "AMOUNT", label: t("booking.otherChargeSourceAmount") },
                    { value: "ITEM", label: t("booking.otherChargeSourceItem") },
                  ]}
                />
                {other.priceSource === "AMOUNT" ? (
                  <NumberInput
                    label={t("booking.otherAmountLabel")}
                    // ⚠️ VAT-inclusive, said on the field: the first person to type a net figure silently
                    // misstates a month, and nothing downstream can detect it.
                    description={t("booking.otherAmountHint")}
                    value={other.amountBaht}
                    onChange={(v) =>
                      setOther((p) => ({ ...p, amountBaht: typeof v === "number" ? v : "" }))
                    }
                    min={1}
                    step={1}
                    allowDecimal={false}
                    thousandSeparator=","
                    className="max-w-xs"
                  />
                ) : catalog.isLoading ? (
                  <Loader size="sm" />
                ) : catalog.data && catalog.data.length > 0 ? (
                  <Select
                    label={t("booking.otherItemLabel")}
                    placeholder={t("booking.otherItemPlaceholder")}
                    data={catalog.data.map((it) => ({
                      value: it.id,
                      label: `${it.name} · ฿${formatPriceMinor(it.unitPriceMinor)}`,
                    }))}
                    value={other.itemId}
                    onChange={(v) => setOther((p) => ({ ...p, itemId: v }))}
                    searchable
                    required
                  />
                ) : (
                  /* 🔴 The empty state, built unconditionally. `/catalog-items` legitimately returns zero on a
                     box where nobody created a backoffice item — and an empty dropdown with no words is
                     indistinguishable from a broken endpoint. The typed amount still works from here. */
                  <Alert color="blue" variant="light" icon={<AlertTriangle size={16} />}>
                    <Text fz="sm">{t("booking.otherItemEmpty")}</Text>
                    <Text fz="xs" c="dimmed" mt={4}>
                      {t("booking.otherItemEmptyHint")}
                    </Text>
                  </Alert>
                )}
              </Stack>
            )}
          </div>

          {/* ── Consume (AC-7/8) — off by default. "Consume" IS setting courseId/voucherId; the existing
              day-end engine deducts from whichever is set, so there is nothing new here but the choice. ── */}
          <div className="rounded-lg border border-muted-200 p-3">
            <Switch
              label={t("booking.otherConsume")}
              checked={other.consume}
              onChange={onOtherConsumeToggle(setOther)}
            />
            {other.consume &&
              (!student?.id ? (
                // A brand-new student typed into the picker has no id and therefore no entitlements — say which
                // step is missing rather than showing an empty dropdown.
                <Text fz="sm" c="dimmed" mt="sm">
                  {t("booking.otherConsumeNeedsStudent")}
                </Text>
              ) : consumeOptions.length === 0 ? (
                <Text fz="sm" c="dimmed" mt="sm">
                  {t("booking.otherConsumeNone")}
                </Text>
              ) : (
                <Select
                  mt="sm"
                  label={t("booking.otherConsumePick")}
                  placeholder={t("booking.pickProgram")}
                  data={consumeOptions}
                  value={other.entitlementId}
                  onChange={(v) => setOther((p) => ({ ...p, entitlementId: v }))}
                  searchable
                  required
                />
              ))}
          </div>

          {/* Every problem at once, in staff's language — the negatives ARE the requirement in REQ-078, and a
              user who can submit an impossible combination and gets a 400 has been told nothing useful. */}
          {otherEval.problemKeys.length > 0 && (
            <Alert color="orange" variant="light" icon={<AlertTriangle size={16} />}>
              <Stack gap={2}>
                {otherEval.problemKeys.map((k) => (
                  <Text key={k} fz="sm">
                    {t(k)}
                  </Text>
                ))}
              </Stack>
            </Alert>
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
          {/* Trial + single session — the two booking types that post revenue, so the two that can be discounted. */}
          {singleFullMinor > 0 && (
            <DiscountSection
              fullMinor={singleFullMinor}
              value={discount}
              onChange={setDiscount}
              serverProblems={discountProblems}
            />
          )}
        </>
      )}

      {/* REQ-068 — one field, every booking type: the note belongs to the SESSION, so it sits with the
          session's own details rather than inside a type-specific branch. Empty ⇒ nothing sent (AC-5). */}
      <AttendeeNoteInput value={attendeeNote} onChange={setAttendeeNote} />

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
    <div className="rounded-lg border border-muted-200 bg-muted-50 px-3 py-2">
      <Text fz="sm">{text}</Text>
    </div>
  );
}
