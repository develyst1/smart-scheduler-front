"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Group, Modal, Select, Stack, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { CalendarPlus, Info, AlertTriangle, Users } from "lucide-react";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import { notify } from "@/lib/ui/notify";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import {
  useCreateCoursePackage,
  usePreviewCourse,
  useTeachers,
  useSellablePackages,
} from "@/hooks/scheduler";
import { courseSizesFor, courseSizesForGroup, isUnpriced, packageFor, packageForGroup } from "@/lib/scheduler/sellable";
import { formatPriceMinor } from "@/types/app/pricing";
import { ApiClientError, errorProblems } from "@/lib/api/client";
import DiscountSection from "@/components/common/DiscountSection";
import { discountPayload, emptyDiscount, evaluateDiscount, type DiscountDraft } from "@/lib/scheduler/discount";
import { Checkbox, SegmentedControl } from "@mantine/core";
import RentalTierPicker, { rentalPrintLine, useRentalPrices } from "@/components/partials/Rental/RentalTierPicker";
import { useT } from "@/lib/i18n";
import {
  LEAVE_QUOTA_BY_SIZE,
  MAX_WEEK_BY_SIZE,
  TIME_SLOTS,
  type EntitlementPlan,
  type PackageSize,
  type PlanSession,
} from "@/types/app/scheduler";
import PlanModal from "./PlanModal";
import { useCan } from "@/hooks/scheduler/useMe";

interface Props {
  opened: boolean;
  onClose: () => void;
  /**
   * REQ-095 Stage 2a (TASK-398) — sell INTO a group: the group's teacher / first date (its weekday) / start time are
   * prefilled and LOCKED, and `groupKey` rides in the body. 🚫 No second course form — this one, with three fields
   * held. `409 GROUP_FULL` / `SLOT_TAKEN` are the server's sentences in the same error slot.
   */
  group?: { groupKey: string; name: string; teacherId: string; startDate: string; startTime: string; priceGroup: string | null };
}

/** TASK-098 — the purchase-time create flow: picker → generate preview → the shared PlanModal (create mode)
 *  → atomic `POST /courses` with per-session overrides. The plan UI itself is TASK-099's component (reused). */
export default function CreatePlanFlow({ opened, onClose, group }: Props) {
  const t = useT();
  const can = useCan(); // REQ-092 Stage 3 — the submit is the act; hidden without its key
  const { data: teachers = [] } = useTeachers();
  const { data: card } = useSellablePackages();
  const preview = usePreviewCourse();
  const create = useCreateCoursePackage();

  const [student, setStudent] = useState<StudentSelectValue | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [size, setSize] = useState<PackageSize>(6);
  const [startDate, setStartDate] = useState<string>(dayjs().add(7, "day").format("YYYY-MM-DD"));
  const [startTime, setStartTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState<EntitlementPlan | null>(null); // phase 2 when set
  const [error, setError] = useState<string | null>(null);
  // SPEC-049 — the 1-based weeks the family already knows they'll miss. Declared HERE (at creation) they are
  // free of quota; the same action later in the plan editor still consumes it (REQ-030 unchanged). The BE owns
  // both that rule and the make-up placement — this state only says WHICH weeks.
  const [absentWeeks, setAbsentWeeks] = useState<number[]>([]);
  // 🧹 TASK-311 §2 — `ceiling` state and the `exceedsCeiling` gate it fed are GONE. `REQ-085 §12` deleted the
  // MAX_WEEK rule and TASK-309 made the DTO field false by construction, so the gate could never fire again and
  // could only tell the next reader that a ceiling still refuses. The field itself stays on the contract for
  // now — the FE stops reading it FIRST, the contract drops it later, never both at once.
  // REQ-063 — the sale's discount. FE math is display only; the BE re-validates and is the source of truth.
  const [discount, setDiscount] = useState<DiscountDraft>(emptyDiscount());
  // REQ-091 Deploy B (TASK-374) — the whole-course rental: OFF by default; when ON, the same tier + remark as the
  // per-session section. Sent only when ON; the remark rule is the server's (refused before the course is written).
  const [rentalOn, setRentalOn] = useState(false);
  const [rentalCode, setRentalCode] = useState<string | null>(null);
  const [rentalRemark, setRentalRemark] = useState("");
  // TASK-391 (REQ-091 §14) — paid upfront (the default: rows born paid, one post) or pay per session (rows born
  // unpaid, collected one by one). A choice, not a rule: both ride to the server as `paidUpfront`.
  const [rentalPaidUpfront, setRentalPaidUpfront] = useState(true);
  const rentalPriceOf = useRentalPrices();
  const rentalLine =
    rentalOn && rentalCode ? rentalPrintLine(t, rentalCode, rentalRemark.trim() || null, rentalPriceOf(rentalCode)) : null;
  const [discountProblems, setDiscountProblems] = useState<string[]>([]);

  const selectedTeacher = teachers.find((tc) => tc.id === teacherId);
  const subjectOptions = selectedTeacher?.subjectOptions ?? [];
  const bookableTeachers = teachers.filter((tc) => bookableOnDate(tc, startDate));

  // TASK-400 — inside a group the card is the GROUP's (`priceGroup` from the server), not the program's: the sizes
  // and the full price a discount is of. Solo stays by program, as today.
  const sellableSizes = group ? courseSizesForGroup(card, group.priceGroup) : courseSizesFor(card, subjectId);
  const unpriced = isUnpriced(card, subjectId);
  const chosen = group ? packageForGroup(card, group.priceGroup, size) : packageFor(card, subjectId, size);
  const sizeOptions = sellableSizes.map((s) => ({
    value: String(s),
    label: t("course.sizeOption", {
      size: s,
      leave: LEAVE_QUOTA_BY_SIZE[s as PackageSize],
      week: MAX_WEEK_BY_SIZE[s as PackageSize],
    }),
  }));

  useEffect(() => {
    if (sellableSizes.length > 0 && !sellableSizes.includes(size)) setSize(sellableSizes[0] as PackageSize);
  }, [subjectId, sellableSizes.join(","), size]);

  // TASK-398 — the group's three, seeded on open (and re-seeded if a different group opens the same form).
  useEffect(() => {
    if (opened && group) {
      setTeacherId(group.teacherId);
      setStartDate(group.startDate);
      setStartTime(group.startTime);
    }
  }, [opened, group?.groupKey]);

  useEffect(() => {
    if (!opened) {
      setStudent(null);
      setTeacherId("");
      setSubjectId("");
      setSize(6);
      setStartDate(dayjs().add(7, "day").format("YYYY-MM-DD"));
      setStartTime("10:00");
      setNote("");
      setPlan(null);
      setError(null);
      setAbsentWeeks([]);
      setDiscount(emptyDiscount());
      setDiscountProblems([]);
    }
  }, [opened]);

  useEffect(() => {
    if (subjectOptions.length === 1) setSubjectId(subjectOptions[0].id);
    else setSubjectId("");
  }, [teacherId, subjectOptions.length]);

  // REQ-063 — "refuse, never clamp": an invalid discount blocks the flow rather than being capped at the price.
  const discountEval = evaluateDiscount(discount, chosen?.priceMinor ?? 0);
  const valid =
    student?.name.trim() &&
    teacherId &&
    subjectId &&
    !!chosen &&
    startDate &&
    startTime &&
    !preview.isPending &&
    discountEval.problemKeys.length === 0;

  /** One preview path for both the first generate and every absence toggle — so the rows on screen are always
   *  the server's answer for the CURRENT set of absences, never FE math (AC-2: saving creates what was previewed). */
  const runPreview = async (weeks: number[]) => {
    setError(null);
    try {
      const p = await preview.mutateAsync({
        teacherId,
        subjectId,
        size,
        startDate,
        startTime,
        absentWeeks: weeks.length ? weeks : undefined,
      });
      setAbsentWeeks(p.absentWeeks ?? weeks);
      setPlan({
        kind: "course",
        id: "",
        student: {
          id: student?.id ?? "",
          name: student?.name ?? "",
          nickname: student?.name ?? "",
        },
        // A declared absence renders as the status it will actually be saved as (SICK_LEAVE), and its appended
        // make-up as EXTENDED — so the draft reads like the real plan and every existing chip/label works
        // unchanged. Order is load-bearing: the first `size` rows are the weekly chain, the rest are make-ups
        // (exactly how the BE builds and previews it) — `confirmCreate` relies on that.
        // TASK-362 (REQ-089 item 1) — a ticked MAKE-UP comes back `absent: true, makeup: true`: ABSENT WINS, so it
        // renders SICK_LEAVE, and the server's extra make-up for it is one more EXTENDED row at the end.
        sessions: p.sessions.map((s, i) => ({
          id: `new-${i}`,
          date: s.date,
          startTime: s.startTime,
          status: s.absent ? "SICK_LEAVE" : s.makeup ? "EXTENDED" : "PENDING",
          teacher: s.teacher,
          subject: s.subject,
        })),
        liveEndDate: p.endDate ?? p.sessions.at(-1)?.date ?? null,
        summary: {
          kind: "course",
          size: p.size,
          // Creation-time absences are FREE (SPEC-049 owner decision B) — showing them as used quota here would
          // be the opposite of the rule being implemented.
          leaveUsed: 0,
          leaveQuota: LEAVE_QUOTA_BY_SIZE[size],
          maxWeek: MAX_WEEK_BY_SIZE[size],
          owedCount: 0,
          expiryDate: p.expiryDate,
        },
      });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  const generate = async () => {
    if (!valid) return;
    setAbsentWeeks([]);
    await runPreview([]);
  };

  /**
   * Toggle one row's planned-absence mark, then re-preview so the end date and make-ups come from the BE.
   * TASK-362 — `weekIndex` is the row's 1-based POSITION in the previewed plan, make-up rows included; whether
   * that position exists, and the cap, are the server's — a refusal is its sentence, shown by `runPreview`.
   */
  const toggleAbsent = async (weekIndex: number) => {
    const next = absentWeeks.includes(weekIndex)
      ? absentWeeks.filter((w) => w !== weekIndex)
      : [...absentWeeks, weekIndex].sort((a, b) => a - b);
    await runPreview(next);
  };

  // Confirm (from PlanModal create mode) → atomic create with the edited per-session plan. A refusal throws
  // ApiClientError, which PlanModal surfaces as the server's reason.
  const confirmCreate = async (sessions: PlanSession[]) => {
    setDiscountProblems([]);
    try {
      return await submitCreate(sessions);
    } catch (e) {
      // REQ-063 — a DISCOUNT_REFUSED carries an ARRAY of reasons; surface them all on the form, then rethrow so
      // PlanModal still shows the headline refusal. Showing one at a time is the failure this AC names.
      const problems = errorProblems(e);
      if (problems.length) setDiscountProblems(problems);
      throw e;
    }
  };

  const submitCreate = async (sessions: PlanSession[]) => {
    const result = await create.mutateAsync({
      studentName: student?.name.trim() ?? "",
      studentId: student?.id,
      studentPhone: student?.phone,
      teacherId,
      subjectId,
      size,
      startDate,
      startTime,
      /**
       * 🔴 TASK-320 (`TASK-284` reopened) — **this was `note:`, and one word was the whole defect.**
       *
       * `note` is the STATUS-FLOW column — where machine text like *"ยกเลิกโดยแอดมิน"* lands, rendered in
       * exactly one place (`BookingModal.tsx:462`). **`attendeeNote` is REQ-068/TASK-178's field: what the plan
       * editor's `Session note` reads and writes, and the only note any LINE message renders.** ⇒ the owner
       * typed a note at creation, every `Session note` was honestly blank, and no `Remark` could appear.
       *
       * 🔑 **Nothing else needed changing: `CreateCourseInput.attendeeNote` and the service's request body have
       * carried this field since TASK-178, and the BE and schema were already wired.** ⇒ *"one note at
       * creation, carried onto every session" had never once been reachable from the UI* — a feature complete
       * on three layers out of four, invisible to every test that asserts only its own side.
       *
       * 🚫 **`note` is NOT sent as well, deliberately** — one box must not write two columns. The status flows
       * OWN `note` and overwrite it, so a second copy would diverge from this one the moment a session was
       * cancelled, and that is the drift class this project keeps paying for. ⚠️ Nothing goes dark by dropping
       * it: the value moves from `BookingModal`'s grey `note` line to its `attendeeNote` block above — the
       * prominent one the teacher actually reads.
       *
       * 🔻 **Not retroactive.** Courses created before this keep their note in `note` and will never grow a
       * `Remark`. 🚫 No migration — that is the owner's call through @Porter, not a thing to slip into a fix.
       */
      attendeeNote: note.trim() || undefined,
      absentWeeks: absentWeeks.length ? absentWeeks : undefined,
      // Untouched ⇒ `undefined` ⇒ the request is byte-identical to a pre-REQ-063 create (AC-7).
      discount: discountPayload(discount, chosen?.priceMinor ?? 0),
      // TASK-374 — OFF ⇒ no key at all; ON ⇒ { code, remark? } — the session rental's own shape.
      rental: rentalOn && rentalCode ? { code: rentalCode, remark: rentalRemark.trim() || undefined, paidUpfront: rentalPaidUpfront } : undefined,
      // TASK-398 — into a group: the key rides only when selling into one.
      groupKey: group?.groupKey,
      // SPEC-045 (REQ-054) — the program is a COURSE-level fact, sent once as `subjectId` above. Per-row
      // `subjectId` is deliberately NOT sent: it was the door through which a brand-new course could be born
      // mixed-program (and its derived program then became whatever `bookings[0]` happened to be). The BE falls
      // back to the course-level subject for every row, so the client cannot emit a mixed course at all.
      // `sessions` describes ONLY the weekly chain — the BE requires exactly `size` of them and appends the
      // make-ups itself from `absentWeeks` (sending the make-up rows too would fail its length check and would
      // also mean the FE deciding placement, which is the BE's job). The first `size` draft rows ARE that chain.
      sessions: sessions.slice(0, size).map((s) => ({
        date: s.date,
        startTime: s.startTime,
        teacherId: s.teacher?.id,
      })),
    });
    notify({
      title: t("course.successTitle"),
      description: t("course.successDesc", { count: result.bookings.length }),
      color: "success",
    });
    onClose();
  };

  // Phase 2 — hand off to the shared plan modal (create mode). Picker modal is closed.
  if (plan) {
    return (
      <PlanModal
        opened={opened}
        onClose={onClose}
        entitlementId={null}
        mode="create"
        initialPlan={plan}
        onConfirm={confirmCreate}
        // SPEC-049 — create-mode planned absences. The modal only reports WHICH week was toggled; every number
        // it displays (live count, end date) comes back from the BE preview above.
        absentWeeks={absentWeeks}
        onToggleAbsent={toggleAbsent}
        previewPending={preview.isPending}
        // TASK-374 — after the plan, before confirm: the whole-course rental, and its line × the count.
        createExtras={
          <Stack gap="xs">
            <Checkbox
              label={t("rental.courseToggle")}
              checked={rentalOn}
              onChange={(e) => setRentalOn(e.currentTarget.checked)}
              size="sm"
            />
            {rentalOn && (
              <>
                <RentalTierPicker code={rentalCode} remark={rentalRemark} onCode={setRentalCode} onRemark={setRentalRemark} />
                <SegmentedControl
                  size="xs"
                  value={rentalPaidUpfront ? "upfront" : "perSession"}
                  onChange={(v) => setRentalPaidUpfront(v === "upfront")}
                  data={[
                    { value: "upfront", label: t("rental.paidUpfront") },
                    { value: "perSession", label: t("rental.payPerSession") },
                  ]}
                />
              </>
            )}
          </Stack>
        }
        createSummaryLine={
          rentalLine
            ? `${t("rental.courseSummary", { line: rentalLine, size })} · ${rentalPaidUpfront ? t("rental.paidUpfront") : t("rental.payPerSession")}`
            : null
        }
      />
    );
  }

  // Phase 1 — the create-only picker chrome.
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 font-semibold">
          <CalendarPlus size={18} />
          {t("plan.createTitle")}
        </span>
      }
      size="lg"
      centered
    >
      <Stack gap="md">
        <Alert color="blue" icon={<Info size={16} />} variant="light">
          {t("plan.createHint")}
        </Alert>

        <StudentSelect value={student} onChange={setStudent} required />

        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        {group && (
          <Alert color="teal" variant="light" icon={<Users size={16} />}>
            {t("booking.groupSellInto", { name: group.name })}
          </Alert>
        )}
        <Select
          label={t("course.teacher")}
          placeholder={t("course.pickTeacher")}
          value={teacherId}
          onChange={(v) => v && setTeacherId(v)}
          disabled={!!group}
          data={teacherSelectData(bookableTeachers)}
          renderOption={({ option, checked }) => (
            <TeacherOption option={option} checked={checked} teachers={bookableTeachers} />
          )}
          allowDeselect={false}
          searchable
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
          searchable
          required
        />

        {unpriced ? (
          <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light">
            {t("course.noPackages")}
          </Alert>
        ) : (
          <Select
            label={t("course.courseSize")}
            placeholder={subjectId ? undefined : t("course.pickProgramFirst")}
            value={sizeOptions.length > 0 ? String(size) : null}
            onChange={(v) => v && setSize(Number(v) as PackageSize)}
            data={sizeOptions}
            disabled={sizeOptions.length === 0}
            allowDeselect={false}
            searchable
            description={chosen ? t("course.priceInclVat", { price: formatPriceMinor(chosen.priceMinor) }) : undefined}
          />
        )}

        {/* REQ-063 — right under the price it applies to. Hidden entirely for a non-admin (the server also 403s). */}
        {chosen && (
          <DiscountSection
            fullMinor={chosen.priceMinor}
            value={discount}
            onChange={setDiscount}
            serverProblems={discountProblems}
          />
        )}

        <Group grow align="flex-start">
          <DatePickerInput
            label={t("course.firstDate")}
            value={startDate}
            onChange={(v) => v && setStartDate(v)}
            disabled={!!group}
            valueFormat="D MMM YYYY"
            minDate={new Date()}
            required
          />
          <Select
            label={t("course.time")}
            value={startTime}
            onChange={(v) => v && setStartTime(v)}
            disabled={!!group}
            data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
            allowDeselect={false}
            searchable
          />
        </Group>

        <TextInput label={t("course.noteField")} value={note} onChange={(e) => setNote(e.currentTarget.value)} />

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {can("action:bookings.course-create") && (
            <Button loading={preview.isPending} disabled={!valid} onClick={generate} leftSection={<CalendarPlus size={16} />}>
              {t("plan.generate")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
