"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, NumberInput, Radio, Select, Stack, Text, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { bahtToMinor } from "@/lib/scheduler/discount";
import { cancelAllBody, fromDateDefault, swapBody, withFromDate, type SeriesRef } from "@/lib/scheduler/other-series";
import { COACH_RATE_KEY, withoutRates } from "@/lib/scheduler/duo";
import { useCan } from "@/hooks/scheduler/useMe";
import { draftFromFacts, teacherRatesMinor, type OtherKind, type OtherScheduleDraft } from "@/lib/scheduler/other-schedule";
import { END_COURSE_REASONS, type EndCourseReason, type TeacherView } from "@/types/app/scheduler";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import MultiDateField from "@/components/partials/Calendar/Modal/MultiDateField";
import OtherScheduleFields from "@/components/partials/Calendar/Modal/OtherScheduleFields";
import { useAddOtherSeriesDates, useAddOtherSeriesTeacher, useCancelAllOtherSeries, useRemoveOtherSeriesTeacher, useSwapOtherSeriesTeacher, useUpdateOtherSeries } from "@/hooks/scheduler/useOtherSeries";
import type { OtherSeries } from "@/types/api/contract";

/**
 * REQ-101 (TASK-429) — the Manage-plan page's dialogs. Each is ONE call; a refusal (`SLOT_TAKEN` naming date · hour ·
 * teacher, `ALREADY_ON_ROW`, `PRIMARY_TEACHER`, `DATE_EXISTS`, the reason's 400) is the server's sentence in the dialog
 * and what was typed stays; nothing was written on a 409, so nothing is refetched until a 2xx.
 */
const errOf = (e: unknown) => (e instanceof ApiClientError ? e.message : (e as Error).message);

/**
 * Key 58 — the closed reasons (the admin's three, `END_COURSE_REASONS`) + a note; ATTENDED rows stay ("kept").
 * REQ-104 (TASK-442) — on a GROUP the line says the cascade: `cascade` = the live seats on the live dates COUNTED from the
 * DTO (`seatCascade`); the toast prints the SERVER's `seatsCancelled` / `householdsTold` (distinct families, TASK-445) — never a client number for families.
 */
export function CancelAllDialog({ series: ref, attended, live, cascade, onClose }: { series: SeriesRef; attended: number; live: number; cascade?: { seats: number; students: number }; onClose: () => void }) {
  const t = useT();
  const cancel = useCancelAllOtherSeries();
  const [reason, setReason] = useState<EndCourseReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!reason) return;
    setError(null);
    try {
      const r = await cancel.mutateAsync({ ref, body: cancelAllBody(reason, note) });
      notify({
        title:
          ref.kind === "group"
            ? t("otherSeries.cancelledGroup", { n: r.cancelled, seats: r.seatsCancelled ?? 0, families: r.householdsTold ?? 0, notices: r.familyNotices ?? 0 })
            : t("otherSeries.cancelledAll", { n: r.cancelled }),
        color: "default",
      });
      onClose();
    } catch (e) {
      setError(errOf(e));
    }
  };
  return (
    <Modal opened onClose={onClose} centered title={t("otherSeries.cancelAllTitle")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
            {error}
          </Alert>
        )}
        <Text size="sm" data-cascade={cascade ? `${cascade.seats}/${cascade.students}` : undefined}>
          {ref.kind === "group" && cascade ? t("otherSeries.cancelAllGroupBody", { live, kept: attended, seats: cascade.seats, students: cascade.students }) : t("otherSeries.cancelAllBody", { live, kept: attended })}
        </Text>
        <Radio.Group label={t("endCourse.reasonLabel")} value={reason} onChange={(v) => setReason(v as EndCourseReason)}>
          <Stack gap={6} mt={4}>
            {END_COURSE_REASONS.map((r) => (
              <Radio key={r} value={r} label={t(`endCourse.${r}`)} />
            ))}
          </Stack>
        </Radio.Group>
        <Textarea label={t("endCourse.noteLabel")} value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={2} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="red" loading={cancel.isPending} disabled={!reason} onClick={() => void submit()}>
            {t("otherSeries.cancelAllConfirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Add (a picker + optional rate) · Remove (an extra) · Swap the primary — each with `fromDate` defaulting to today. */
export function TeacherDialog({ seriesRef, series, teachers, mode, teacherId, onClose }: { seriesRef: SeriesRef; series: OtherSeries; teachers: TeacherView[]; mode: "add" | "remove" | "swap"; teacherId?: string; onClose: () => void }) {
  const t = useT();
  const add = useAddOtherSeriesTeacher();
  const remove = useRemoveOtherSeriesTeacher();
  const swap = useSwapOtherSeriesTeacher();
  const [to, setTo] = useState<string | null>(null);
  const [rateBaht, setRateBaht] = useState<number | "">("");
  const [fromDate, setFromDate] = useState<string>(fromDateDefault());
  const [error, setError] = useState<string | null>(null);
  // REQ-102 §8 (TASK-432) — the optional rate box only with key 59; never `rateMinor` in the body without it.
  const can = useCan();
  const canRate = can(COACH_RATE_KEY);
  const onRow = [series.teacherId, ...series.additionalTeacherIds];
  const choices = teachers.filter((x) => x.bookable && !onRow.includes(x.id));
  const name = (id: string) => teachers.find((x) => x.id === id)?.nickname ?? id;
  const busy = add.isPending || remove.isPending || swap.isPending;
  const submit = async () => {
    setError(null);
    try {
      if (mode === "add" && to) {
        const r = await add.mutateAsync({ ref: seriesRef, body: withoutRates(withFromDate({ teacherId: to, ...(rateBaht !== "" ? { rateMinor: bahtToMinor(rateBaht) } : {}) }, fromDate), canRate) });
        notify({ title: t("otherSeries.teacherAdded", { name: name(to), n: r.added }), color: "success" });
      } else if (mode === "remove" && teacherId) {
        const r = await remove.mutateAsync({ ref: seriesRef, teacherId, ...(fromDate !== fromDateDefault() ? { fromDate } : {}) });
        notify({ title: t("otherSeries.teacherRemoved", { name: name(teacherId), n: r.removed }), color: "default" });
      } else if (mode === "swap" && to) {
        // REQ-104 — OTHER sends `{ from, to }` (`from` = the primary); a GROUP sends `{ to }` alone (the server delegates to the group swap, the seats follow).
        const r = await swap.mutateAsync({ ref: seriesRef, body: withFromDate(swapBody(seriesRef, series.teacherId, to), fromDate) });
        notify({ title: t("otherSeries.teacherSwapped", { from: name(series.teacherId), to: name(to), n: r.moved }), color: "success" });
      } else return;
      onClose();
    } catch (e) {
      setError(errOf(e));
    }
  };
  const title = mode === "add" ? t("otherSeries.addTeacher") : mode === "remove" ? t("otherSeries.removeTeacherTitle", { name: name(teacherId ?? "") }) : t("otherSeries.swapPrimaryTitle", { name: name(series.teacherId) });
  return (
    <Modal opened onClose={onClose} centered title={title} data-teacher-dialog={mode}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
            {error}
          </Alert>
        )}
        {mode !== "remove" && (
          <Select
            label={mode === "swap" ? t("otherSeries.swapTo") : t("course.teacher")}
            data={teacherSelectData(choices)}
            value={to}
            onChange={setTo}
            searchable
            renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
          />
        )}
        {mode === "add" && canRate && <NumberInput label={t("otherSeries.rateOptional")} value={rateBaht} onChange={(v) => setRateBaht(typeof v === "number" ? v : "")} min={0} step={50} allowDecimal={false} allowNegative={false} suffix=" ฿" className="max-w-xs" />}
        <DatePickerInput label={t("otherSeries.fromDate")} description={t("otherSeries.fromDateHint")} value={fromDate} onChange={(v) => v && setFromDate(v)} valueFormat="D MMM YYYY" popoverProps={{ withinPortal: true }} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color={mode === "remove" ? "red" : undefined} loading={busy} disabled={mode !== "remove" && !to} onClick={() => void submit()}>
            {mode === "remove" ? t("otherSeries.removeTeacher") : t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** `POST …/dates` — the shared multi-date picker; a clash or `DATE_EXISTS` is the server's sentence, the ticks stay. */
export function AddDatesDialog({ seriesRef, existing, onClose }: { seriesRef: SeriesRef; existing: string[]; onClose: () => void }) {
  const t = useT();
  const addDates = useAddOtherSeriesDates();
  const [dates, setDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      const r = await addDates.mutateAsync({ ref: seriesRef, dates });
      notify({ title: t("otherSeries.datesAdded", { n: r.created }), color: "success" });
      onClose();
    } catch (e) {
      setError(errOf(e));
    }
  };
  return (
    <Modal opened onClose={onClose} centered title={t("otherSeries.addDates")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
            {error}
          </Alert>
        )}
        <Text size="xs" c="dimmed">
          {t("otherSeries.addDatesHint", { n: existing.length })}
        </Text>
        <MultiDateField value={dates} onChange={setDates} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={addDates.isPending} disabled={dates.length === 0} onClick={() => void submit()}>
            {t("otherSeries.addDatesConfirm", { n: dates.length })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** `PATCH …/:key` — title · kind (the human kinds only) · heads · rates; only what changed rides; no `startTime`. */
export function EditHeaderDialog({ seriesRef, series, teachers, onClose }: { seriesRef: SeriesRef; series: OtherSeries; teachers: TeacherView[]; onClose: () => void }) {
  const t = useT();
  const update = useUpdateOtherSeries();
  const teacherIds = [series.teacherId, ...series.additionalTeacherIds];
  const [title, setTitle] = useState(series.title);
  // REQ-104 — a GROUP's kind is fixed (DUO/Group): the kind select is hidden and `otherKind` never rides (the server's 400).
  const isGroup = seriesRef.kind === "group";
  const [draft, setDraft] = useState<OtherScheduleDraft>(draftFromFacts({ kind: isGroup ? null : (series.kind as OtherKind | null), headCount: series.headCount, teacherRates: series.teacherRates ?? {}, ratePostedAt: null }, teacherIds));
  const [error, setError] = useState<string | null>(null);
  const can = useCan();
  const canRate = can(COACH_RATE_KEY);
  const submit = async () => {
    setError(null);
    const rates = teacherRatesMinor(draft.ratesBaht, teacherIds);
    const sameRates = JSON.stringify(rates ?? {}) === JSON.stringify(series.teacherRates ?? {});
    const patch = withoutRates(
      {
        ...(title.trim() !== series.title ? { title: title.trim() } : {}),
        ...(!isGroup && draft.kind && draft.kind !== series.kind ? { otherKind: draft.kind } : {}),
        ...((draft.headCount === "" ? null : draft.headCount) !== series.headCount ? { headCount: draft.headCount === "" ? null : draft.headCount } : {}),
        ...(sameRates ? {} : { teacherRates: rates ?? {} }),
      },
      canRate,
    );
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    try {
      await update.mutateAsync({ ref: seriesRef, patch });
      notify({ title: t("otherSeries.headerSaved"), color: "success" });
      onClose();
    } catch (e) {
      setError(errOf(e));
    }
  };
  return (
    <Modal opened onClose={onClose} centered title={t("otherSeries.editHeader")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
            {error}
          </Alert>
        )}
        <Textarea label={t("booking.otherTitle")} value={title} onChange={(e) => setTitle(e.currentTarget.value)} autosize minRows={1} required />
        <OtherScheduleFields value={draft} onChange={setDraft} teacherIds={teacherIds} teachers={teachers} kindRequired={!isGroup} hideKind={isGroup} />
        <Text size="xs" c="dimmed">
          {t("otherSeries.noTimeHint")}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={update.isPending} disabled={!title.trim()} onClick={() => void submit()}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
