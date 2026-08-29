"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/th";
import {
  Modal,
  Button,
  Select,
  NumberInput,
  Group,
  Stack,
  Alert,
  Text,
  SegmentedControl,
  Badge,
  Divider,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { History, Info, AlertTriangle, Check } from "lucide-react";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { useImportCoursePackage, useImportVoucher, useTeachers } from "@/hooks/scheduler";
import { previewCourseImport } from "@/services/scheduler.service";
import { remainingSessions, remainingDates, usedExceedsSize } from "@/lib/scheduler/import-preview";
import { useI18n } from "@/lib/i18n";
import { TIME_SLOTS } from "@/types/app/scheduler";

type Kind = "COURSE" | "VOUCHER";

interface Props {
  opened: boolean;
  onClose: () => void;
}

/**
 * Migrating a course/voucher that is **already part-way through** (SPEC-025 / TASK-080).
 *
 * Design target: one admin, one sitting, ~20–36 families off an Excel list on 20 August. So the modal
 * **stays open after each save** and keeps teacher / day / time / program — only the student and the used
 * count are cleared. It posts to the **import** endpoints; nothing is charged.
 */
export default function ImportBalanceModal({ opened, onClose }: Props) {
  const { t, lang } = useI18n();
  const { data: teachers = [] } = useTeachers();
  const importCourse = useImportCoursePackage();
  const importVoucher = useImportVoucher();

  const [kind, setKind] = useState<Kind>("COURSE");
  const [student, setStudent] = useState<StudentSelectValue | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [size, setSize] = useState<number>(10);
  // TASK-214 — the default is the price card's 4/6/10. An off-card size is a deliberate, separate choice, not
  // the default: free-number-by-default is what let an unsupported size reach the server as a 500.
  const [offCard, setOffCard] = useState(false);
  const [leaveQuota, setLeaveQuota] = useState<number>(2);
  // The server's computed default for the expiry. Shown, then editable — a date the family actually bought
  // beats anything we compute (TASK-195 narrowed rather than reversed).
  const [sizeProblem, setSizeProblem] = useState<string | null>(null);
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [used, setUsed] = useState<number>(0);
  const [startDate, setStartDate] = useState<string>(dayjs().add(7, "day").format("YYYY-MM-DD"));
  const [startTime, setStartTime] = useState("10:00");
  const [expiryDate, setExpiryDate] = useState<string>(dayjs().add(3, "month").format("YYYY-MM-DD"));
  const [totalHours, setTotalHours] = useState<number>(10);
  const [usedHours, setUsedHours] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  /** How many families have been entered without closing — the sitting is the unit of work, not the form. */
  const [savedCount, setSavedCount] = useState(0);

  const selectedTeacher = teachers.find((tc) => tc.id === teacherId);
  const subjectOptions = selectedTeacher?.subjectOptions ?? [];
  const bookableTeachers = teachers.filter((tc) => bookableOnDate(tc, startDate));

  useEffect(() => {
    if (subjectOptions.length === 1) setSubjectId(subjectOptions[0].id);
    else setSubjectId("");
  }, [teacherId, subjectOptions.length]);

  // TASK-213/214 — the expiry DEFAULT and the off-card size verdict both come from the server, so the form
  // holds no second copy of either rule. The returned date only ever SEEDS the field; a human edit wins.
  useEffect(() => {
    if (!opened || kind !== "COURSE" || !size || !startDate) return;
    let cancelled = false;
    void previewCourseImport({
      size,
      leaveQuota: offCard ? leaveQuota : undefined,
      usedSessions: used,
      startDate,
    })
      .then((p) => {
        if (cancelled) return;
        setSizeProblem(p.ok ? null : (p.problem ?? null));
        // Seed only — never overwrite a date the user has already touched for this entry.
        if (p.ok && p.expiryDate && !expiryTouched) setExpiryDate(p.expiryDate);
      })
      .catch(() => {
        // A preview failure must not block the form: the save re-validates server-side anyway.
        if (!cancelled) setSizeProblem(null);
      });
    return () => {
      cancelled = true;
    };
  }, [opened, kind, size, offCard, leaveQuota, used, startDate, expiryTouched]);

  // Only reset the whole form when the modal is actually dismissed — NOT between entries.
  useEffect(() => {
    if (!opened) {
      setStudent(null);
      setTeacherId("");
      setSubjectId("");
      setSize(10);
      setOffCard(false);
      setLeaveQuota(2);
      setSizeProblem(null);
      setExpiryTouched(false);
      setUsed(0);
      setTotalHours(10);
      setUsedHours(0);
      setStartDate(dayjs().add(7, "day").format("YYYY-MM-DD"));
      setStartTime("10:00");
      setExpiryDate(dayjs().add(3, "month").format("YYYY-MM-DD"));
      setError(null);
      setSavedCount(0);
    }
  }, [opened]);

  const remaining = remainingSessions(size, used);
  const dates = remainingDates(startDate, remaining);
  const overUsed =
    kind === "COURSE" ? usedExceedsSize(size, used) : usedHours > totalHours;
  const voucherRemaining = Math.max(0, (totalHours || 0) - (usedHours || 0));

  const fmtDate = (d: string) => {
    const x = dayjs(d).locale(lang);
    return lang === "th" ? `${x.format("ddd D MMM")} ${x.year() + 543}` : x.format("ddd D MMM YYYY");
  };

  const valid =
    !!student?.name.trim() &&
    !overUsed &&
    !!expiryDate &&
    (kind === "COURSE"
      ? !!teacherId && !!subjectId && !!startDate && !!startTime && remaining > 0
      : totalHours > 0);

  const busy = importCourse.isPending || importVoucher.isPending;

  const handleSave = async () => {
    if (!valid) return;
    setError(null);
    try {
      if (kind === "COURSE") {
        await importCourse.mutateAsync({
          studentName: student!.name.trim(),
          studentId: student!.id,
          studentPhone: student!.phone,
          teacherId,
          subjectId,
          size,
          leaveQuota: offCard ? leaveQuota : undefined,
          usedSessions: used,
          startDate,
          startTime,
          expiryDate,
        });
      } else {
        await importVoucher.mutateAsync({
          studentName: student!.name.trim(),
          studentId: student!.id,
          studentPhone: student!.phone,
          totalHours,
          usedHours,
          expiryDate,
        });
      }
      notify({
        title: t("importBalance.savedTitle"),
        description: t("importBalance.savedDesc", { student: student!.name.trim() }),
        color: "success",
      });
      // 🔴 TASK-214 — the owner asked for the dialog to CLOSE on a successful save. That replaces the previous
      // batch-entry behaviour (stay open, keep teacher/day/time/size for the next family). Noted in the task:
      // it costs re-entry per family, and it is his call to make.
      setSavedCount((n) => n + 1);
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("importBalance.failGeneric"));
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="lg"
      title={
        <Group gap="xs">
          <History size={18} />
          <span className="font-semibold">{t("importBalance.title")}</span>
          {savedCount > 0 && (
            <Badge color="green" variant="light" leftSection={<Check size={12} />}>
              {t("importBalance.savedCount", { n: savedCount })}
            </Badge>
          )}
        </Group>
      }
    >
      <Stack gap="md">
        {/* The one line that must never be missed by someone entering 30 families. */}
        <Alert color="blue" icon={<Info size={16} />} variant="light">
          {t("importBalance.noPayment")}
        </Alert>

        <SegmentedControl
          fullWidth
          value={kind}
          onChange={(v) => setKind(v as Kind)}
          data={[
            { value: "COURSE", label: t("importBalance.kindCourse") },
            { value: "VOUCHER", label: t("importBalance.kindVoucher") },
          ]}
        />

        {/* Remounted after each save: clearing `value` alone leaves StudentSelect's own search text on screen,
            so the previous family's name sits in the box looking like it didn't save. Keyed on the counter, the
            field comes back genuinely empty and the cursor lands here for the next family. */}
        <StudentSelect key={savedCount} value={student} onChange={setStudent} required />

        {kind === "COURSE" ? (
          <>
            {/* REQ-064 AC-8 — rows align at their INPUTS, not at the tops of their wrappers. A Mantine
                Input.Wrapper renders label → description → input, so `flex-end` puts the input boxes on one
                line **whatever height the helper text takes** — including when it wraps at 375. `flex-start`
                is what pushed `Remaining sessions start` below `Time`: only the left field had a two-line
                helper. Applied to EVERY field row in this form, so the next helper that wraps can't re-open
                this; nudging the one reported box would have. */}
            <Group grow align="flex-end">
              {/* TASK-214 — the price card's sizes are the default; OFF-CARD is a deliberate extra choice. */}
              <Select
                label={t("importBalance.size")}
                description={t("importBalance.sizeHint")}
                value={offCard ? "OFF" : String(size)}
                onChange={(v) => {
                  if (!v) return;
                  if (v === "OFF") {
                    setOffCard(true);
                    return;
                  }
                  setOffCard(false);
                  setSize(Number(v));
                }}
                data={[
                  { value: "4", label: t("importBalance.sizeOption", { n: 4 }) },
                  { value: "6", label: t("importBalance.sizeOption", { n: 6 }) },
                  { value: "10", label: t("importBalance.sizeOption", { n: 10 }) },
                  { value: "OFF", label: t("importBalance.sizeOffCard") },
                ]}
                allowDeselect={false}
              />
              <NumberInput
                label={t("importBalance.used")}
                description={t("importBalance.usedHint")}
                value={used}
                onChange={(v) => setUsed(Number(v) || 0)}
                min={0}
                max={100}
                allowDecimal={false}
                error={overUsed ? t("importBalance.usedTooHigh") : undefined}
              />
            </Group>

            {/* TASK-214 — revealed only for an off-card size: the free size plus the ONE extra field the rule
                needs (quota). `MAX_WEEK = size + quota` is the server's derivation, never a second field here. */}
            {offCard && (
              <Group grow align="flex-end">
                <NumberInput
                  label={t("importBalance.sizeCustom")}
                  value={size}
                  onChange={(v) => setSize(Number(v) || 0)}
                  min={1}
                  max={100}
                  allowDecimal={false}
                  error={sizeProblem ?? undefined}
                />
                <NumberInput
                  label={t("importBalance.leaveQuota")}
                  description={t("importBalance.leaveQuotaHint")}
                  value={leaveQuota}
                  onChange={(v) => setLeaveQuota(Number(v) || 0)}
                  min={0}
                  max={20}
                  allowDecimal={false}
                />
              </Group>
            )}

            <Select
              label={t("course.teacher")}
              placeholder={t("course.pickTeacher")}
              value={teacherId}
              onChange={(v) => v && setTeacherId(v)}
              data={teacherSelectData(bookableTeachers)}
              renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
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

            <Group grow align="flex-end">
              <DatePickerInput
                label={t("importBalance.resumeDate")}
                description={t("importBalance.resumeHint")}
                value={startDate}
                onChange={(v) => v && setStartDate(v)}
                valueFormat="D MMM YYYY"
                popoverProps={{ withinPortal: true }}
              />
              <Select
                label={t("course.time")}
                value={startTime}
                onChange={(v) => v && setStartTime(v)}
                data={TIME_SLOTS}
                allowDeselect={false}
                searchable
              />
            </Group>
          </>
        ) : (
          <Group grow align="flex-end">
            <NumberInput
              label={t("importBalance.totalHours")}
              value={totalHours}
              onChange={(v) => setTotalHours(Number(v) || 0)}
              min={1}
              max={100}
              allowDecimal={false}
            />
            <NumberInput
              label={t("importBalance.usedHours")}
              value={usedHours}
              onChange={(v) => setUsedHours(Number(v) || 0)}
              min={0}
              max={100}
              allowDecimal={false}
              error={overUsed ? t("importBalance.usedTooHigh") : undefined}
            />
          </Group>
        )}

        {/* Expiry is the ORIGINAL purchase's and is never computed here — that's the whole point of import. */}
        <DatePickerInput
          label={t("importBalance.expiry")}
          description={t("importBalance.expiryHint")}
          value={expiryDate}
          onChange={(v) => {
            if (!v) return;
            // Once a human sets the date, the server's computed default stops seeding it (TASK-195's rule:
            // honour a deliberate date).
            setExpiryTouched(true);
            setExpiryDate(v);
          }}
          valueFormat="D MMM YYYY"
          popoverProps={{ withinPortal: true }}
          required
        />

        <Divider />

        {/* Show the consequence BEFORE saving — `used` is the one field with no everyday meaning. */}
        {overUsed ? (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {t("importBalance.usedTooHigh")}
          </Alert>
        ) : kind === "COURSE" ? (
          <Alert color={remaining > 0 ? "green" : "orange"} variant="light">
            <Text size="sm" fw={600}>
              {remaining > 0
                ? t("importBalance.previewCourse", {
                    remaining,
                    date: fmtDate(dates[0] ?? startDate),
                  })
                : t("importBalance.previewNothing")}
            </Text>
            {dates.length > 1 && (
              <Text size="xs" c="dimmed" mt={4}>
                {t("importBalance.previewLast", { date: fmtDate(dates[dates.length - 1]) })}
              </Text>
            )}
          </Alert>
        ) : (
          <Alert color={voucherRemaining > 0 ? "green" : "orange"} variant="light">
            <Text size="sm" fw={600}>
              {t("importBalance.previewVoucher", { remaining: voucherRemaining })}
            </Text>
          </Alert>
        )}

        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={busy}>
            {t("importBalance.done")}
          </Button>
          <Button onClick={handleSave} loading={busy} disabled={!valid}>
            {t("importBalance.saveAndNext")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
