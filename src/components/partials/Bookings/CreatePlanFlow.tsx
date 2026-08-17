"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Group, Modal, Select, Stack, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { CalendarPlus, Info, AlertTriangle } from "lucide-react";
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
import { courseSizesFor, isUnpriced, packageFor } from "@/lib/scheduler/sellable";
import { formatPriceMinor } from "@/types/app/pricing";
import { ApiClientError } from "@/lib/api/client";
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

interface Props {
  opened: boolean;
  onClose: () => void;
}

/** TASK-098 — the purchase-time create flow: picker → generate preview → the shared PlanModal (create mode)
 *  → atomic `POST /courses` with per-session overrides. The plan UI itself is TASK-099's component (reused). */
export default function CreatePlanFlow({ opened, onClose }: Props) {
  const t = useT();
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

  const selectedTeacher = teachers.find((tc) => tc.id === teacherId);
  const subjectOptions = selectedTeacher?.subjectOptions ?? [];
  const bookableTeachers = teachers.filter((tc) => bookableOnDate(tc, startDate));

  const sellableSizes = courseSizesFor(card, subjectId);
  const unpriced = isUnpriced(card, subjectId);
  const chosen = packageFor(card, subjectId, size);
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
    }
  }, [opened]);

  useEffect(() => {
    if (subjectOptions.length === 1) setSubjectId(subjectOptions[0].id);
    else setSubjectId("");
  }, [teacherId, subjectOptions.length]);

  const valid =
    student?.name.trim() && teacherId && subjectId && !!chosen && startDate && startTime && !preview.isPending;

  const generate = async () => {
    if (!valid) return;
    setError(null);
    try {
      const p = await preview.mutateAsync({ teacherId, subjectId, size, startDate, startTime });
      setPlan({
        kind: "course",
        id: "",
        student: {
          id: student?.id ?? "",
          name: student?.name ?? "",
          nickname: student?.name ?? "",
        },
        sessions: p.sessions.map((s, i) => ({
          id: `new-${i}`,
          date: s.date,
          startTime: s.startTime,
          status: "PENDING",
          teacher: s.teacher,
          subject: s.subject,
        })),
        liveEndDate: p.sessions.at(-1)?.date ?? null,
        summary: {
          kind: "course",
          size: p.size,
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

  // Confirm (from PlanModal create mode) → atomic create with the edited per-session plan. A refusal throws
  // ApiClientError, which PlanModal surfaces as the server's reason.
  const confirmCreate = async (sessions: PlanSession[]) => {
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
      // SPEC-045 (REQ-054) — the program is a COURSE-level fact, sent once as `subjectId` above. Per-row
      // `subjectId` is deliberately NOT sent: it was the door through which a brand-new course could be born
      // mixed-program (and its derived program then became whatever `bookings[0]` happened to be). The BE falls
      // back to the course-level subject for every row, so the client cannot emit a mixed course at all.
      sessions: sessions.map((s) => ({
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

        <Select
          label={t("course.teacher")}
          placeholder={t("course.pickTeacher")}
          value={teacherId}
          onChange={(v) => v && setTeacherId(v)}
          data={teacherSelectData(bookableTeachers)}
          renderOption={({ option }) => <TeacherOption option={option} teachers={bookableTeachers} />}
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
            searchable
          />
        </Group>

        <TextInput label={t("course.noteField")} value={note} onChange={(e) => setNote(e.currentTarget.value)} />

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={preview.isPending} disabled={!valid} onClick={generate} leftSection={<CalendarPlus size={16} />}>
            {t("plan.generate")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
