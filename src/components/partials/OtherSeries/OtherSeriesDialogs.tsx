"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Group, Modal, NumberInput, Radio, Select, Stack, Text, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { bahtToMinor } from "@/lib/scheduler/discount";
import { cancelAllBody, fromDateDefault, swapBody, withFromDate, type SeriesRef } from "@/lib/scheduler/other-series";
import { coverRateRequired, knownSeriesRate, scopeBody, scopeDateLabelKey, scopeOutcomeKey, type SeriesScope } from "@/lib/scheduler/series-scope";
import { COACH_RATE_KEY, withoutRates } from "@/lib/scheduler/duo";
import { useCan } from "@/hooks/scheduler/useMe";
import { draftFromFacts, teacherRatesMinor, type OtherKind, type OtherScheduleDraft } from "@/lib/scheduler/other-schedule";
import { END_COURSE_REASONS, SESSION_ONLY_CANCEL_REASONS, type EndCourseReason, type SessionCancelReason, type TeacherView } from "@/types/app/scheduler";
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
  /**
   * 🔴 **TASK-694 (QA F1) — a GROUP series' seats are COURSE classes, so "a problem on our side" earns each seat +1 week.** The OTHER (non-group)
   * series has no course behind it, so the choice would add nothing and its hint would be false: **group only.** Off by default; ticked, it IS
   * the reason (`SCHOOL_ISSUE`) — so the three radios are not asked.
   */
  const [ourSide, setOurSide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen: SessionCancelReason | null = ourSide ? SESSION_ONLY_CANCEL_REASONS[0] : reason;
  const submit = async () => {
    if (!chosen) return;
    setError(null);
    try {
      const r = await cancel.mutateAsync({ ref, body: cancelAllBody(chosen, note) });
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
        <Radio.Group label={t("endCourse.reasonLabel")} value={ourSide ? null : reason} onChange={(v) => setReason(v as EndCourseReason)}>
          <Stack gap={6} mt={4}>
            {END_COURSE_REASONS.map((r) => (
              <Radio key={r} value={r} label={t(`endCourse.${r}`)} disabled={ourSide} />
            ))}
          </Stack>
        </Radio.Group>
        {ref.kind === "group" && (
          <Checkbox
            checked={ourSide}
            onChange={(e) => {
              setOurSide(e.currentTarget.checked);
              // 🔴 TASK-695 — ticking turns the radios off AND forgets an earlier pick, so unticking never revives a choice the admin cannot see
              if (e.currentTarget.checked) setReason(null);
            }}
            label={t("endCourse.SCHOOL_ISSUE")}
            description={t("cancelBooking.schoolIssueHint")}
            data-our-side-cancel
          />
        )}
        <Textarea label={t("endCourse.noteLabel")} value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={2} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="red" loading={cancel.isPending} disabled={!chosen} onClick={() => void submit()}>
            {t("otherSeries.cancelAllConfirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Add (a picker + optional rate) · Remove (an extra) · Swap ANY teacher on the row — each with `fromDate` defaulting to today. */
export function TeacherDialog({ seriesRef, series, teachers, mode, teacherId, onClose }: { seriesRef: SeriesRef; series: OtherSeries; teachers: TeacherView[]; mode: "add" | "remove" | "swap"; teacherId?: string; onClose: () => void }) {
  const t = useT();
  const add = useAddOtherSeriesTeacher();
  const remove = useRemoveOtherSeriesTeacher();
  const swap = useSwapOtherSeriesTeacher();
  const [to, setTo] = useState<string | null>(null);
  const [rateBaht, setRateBaht] = useState<number | "">("");
  /**
   * 🔴 TASK-624 (1b) — the OPTIONAL rate on a "from here on" swap, mirroring the group swap (TASK-634). A SEPARATE box from
   * the cover's: typing a one-session rate and then choosing "the rest" must not carry that number across — *a rate for
   * one day is not a rate for the series.* Empty by default and by rule: 🚫 nothing seeds this.
   */
  const [restRateBaht, setRestRateBaht] = useState<number | "">("");
  const [fromDate, setFromDate] = useState<string>(fromDateDefault());
  // 🔴 TASK-564 (REQ-110 item 5) — the scope the door must ASK for. 🚫 `null` on purpose: Khwan's complaint is that one
  // teacher change silently rewrote every remaining session, and **a pre-selected “the rest” would reproduce that with
  // one extra click.** The server refuses a body naming neither scope (400), so this is also the shape it now requires.
  /**
   * 🔴 TASK-673 (server: TASK-672; found in TASK-624 Q3) — a GROUP swap has exactly ONE valid scope: "from here on". The group's
   * route (`PATCH /group-series/:key/teacher`) has no `onDate`, so "this session only" was never something it could honour —
   * it was silently swapping the whole group from today AND paying the one-session rate from today onward. The server now
   * refuses it; 🔑 this makes the screen never OFFER it, so an admin is not refused for a choice we put in front of them.
   * ⇒ The scope is FIXED to `rest` and the question is not asked (there is one answer, so there is nothing to ask — Khwan's
   * complaint was an unasked question with a hidden effect, and the date label below still says what the date means).
   * 🚫 OTHER series are untouched (both scopes, nothing pre-selected), and so is ADD on a group (the add route does take `onDate`).
   * 📌 Set by an effect, NOT by the initial state: `useState<SeriesScope>(null)` below is pinned (TASK-564, series-scope.test.ts) as
   * the claim that no door that ASKS the question starts with an answer — and that stays true. The group swap is the one door with
   * nothing to ask, so it is given its only answer on mount (the first paint has `null`, so Save is shut until it lands).
   */
  const isGroupSwap = seriesRef.kind === "group" && mode === "swap";
  const [scope, setScope] = useState<SeriesScope>(null);
  useEffect(() => {
    if (isGroupSwap) setScope("rest");
  }, [isGroupSwap]);
  const [error, setError] = useState<string | null>(null);
  // REQ-102 §8 (TASK-432) — the optional rate box only with key 59; never `rateMinor` in the body without it.
  const can = useCan();
  const canRate = can(COACH_RATE_KEY);
  const onRow = [series.teacherId, ...series.additionalTeacherIds];
  /**
   * 🔴 TASK-624 — WHO GOES OUT, said by the door that was pressed. 🔑 **One dialog, one body builder, no branch on whether
   * this teacher is the primary:** the screen only says who; the server decides what that teacher's position means.
   * (`teacherId` is also what Remove already carries. The primary is the fallback for a caller that names nobody.)
   */
  const from = teacherId ?? series.teacherId;
  // 🔴 TASK-577 (D10) — a COVER is refused without a rate, and the FE has none to carry for anyone it can offer.
  const needRate = coverRateRequired(mode, scope);
  const carried = knownSeriesRate(series.teacherRates, to);
  const coverRateMinor = rateBaht !== "" ? bahtToMinor(rateBaht) : carried;
  /** 🔴 TASK-624 (1b) — shown for a swap over the REST of the series, and only for an admin who may price a coach. */
  const restRate = mode === "swap" && scope === "rest" && canRate;
  /**
   * 🔴 **TASK-584 (BE) → TASK-592 — the owner ruled (a): a COVER requires the rate permission (key 59).**
   *
   * The server already refuses it, so 🔑 **this is the screen catching up with a rule that is already true** — not a new
   * rule, and not a rule of the screen's own. ⇒ **an admin without the key is TOLD, in words, naming the PERMISSION.**
   * 🚫 **Not a hidden door and not a dead one:** *a control that does nothing is the dead end this whole round was spent
   * removing* — they can see the cover exists, read why they cannot do it, and go to someone who can.
   * ⚠️ **Nothing changes for an admin WITH the key** (pinned): this adds a state, it does not narrow theirs.
   */
  const coverBlocked = needRate && !canRate;
  const choices = teachers.filter((x) => x.bookable && !onRow.includes(x.id));
  const name = (id: string) => teachers.find((x) => x.id === id)?.nickname ?? id;
  const busy = add.isPending || remove.isPending || swap.isPending;
  const scoped = scopeBody(scope, fromDate);
  const submit = async () => {
    setError(null);
    // 🚫 Nothing is sent until a scope is chosen — the same refusal the server makes, made before the request.
    if (mode !== "remove" && !scoped) return;
    // 🔑 Two guards on the cover rate as well: this return AND the Save button. 🚫 Nothing is sent that we already know
    // the server will refuse — a 400 the screen could have prevented is a dead end, which is exactly D10.
    if (needRate && canRate && coverRateMinor == null) return;
    // 🔴 TASK-592 — the same two-guard shape for the permission: this return AND the Save button. 🚫 We never send a body
    // we already know the server refuses (403) — *a refusal the screen could have explained is a dead end.*
    if (coverBlocked) return;
    try {
      if (mode === "add" && to) {
        // 🔑 EXACTLY one scope key rides (`onDate` or `fromDate`) — never both, never neither.
        const r = await add.mutateAsync({
          ref: seriesRef,
          body: withoutRates({ teacherId: to, ...(rateBaht !== "" ? { rateMinor: bahtToMinor(rateBaht) } : {}), ...scoped }, canRate),
        });
        notify({ title: t("otherSeries.teacherAdded", { name: name(to), n: r.added }), color: "success" });
      } else if (mode === "remove" && teacherId) {
        const r = await remove.mutateAsync({ ref: seriesRef, teacherId, ...(fromDate !== fromDateDefault() ? { fromDate } : {}) });
        notify({ title: t("otherSeries.teacherRemoved", { name: name(teacherId), n: r.removed }), color: "default" });
      } else if (mode === "swap" && to) {
        // REQ-104 — OTHER sends `{ from, to }` (🔴 TASK-624: `from` = the teacher whose Swap door was pressed — the primary or an extra);
        // a GROUP sends `{ to }` alone (the server delegates to the group swap, the seats follow) — which is why a GROUP has no door on an extra.
        // 📌 The rate rides in exactly two places, each its own box and each only for a scope where it means something:
        // a COVER (`onDate`, required) and the REST of the series (`fromDate`, optional) — and never without key 59.
        // 🔴 TASK-577 — the rate rides ONLY on a cover (`onDate`), and only with the key: the server refuses a rate
        // without key 59 (403) and refuses a cover WITHOUT one (400) — so an admin holding neither cannot save this,
        // which is a permission question, not a thing to paper over with a number.
        const rateOnCover = needRate && coverRateMinor != null ? { rateMinor: coverRateMinor } : {};
        // 🔴 TASK-624 (1b) — over the REST of the series the rate is OPTIONAL: since TASK-625 the server prices the incoming
        // coach from what this series has already paid them and refuses (`RATE_REQUIRED`) only when it cannot — and this is
        // the answer to that refusal. 🚫 Never `undefined`/empty: the server's key-59 gate reads the BODY, so a present-but-
        // empty key would cost an ordinary swap a permission.
        const rateOnRest = restRate && restRateBaht !== "" ? { rateMinor: bahtToMinor(restRateBaht) } : {};
        const r = await swap.mutateAsync({
          ref: seriesRef,
          body: withoutRates({ ...swapBody(seriesRef, from, to), ...scoped, ...rateOnCover, ...rateOnRest }, canRate),
        });
        notify({ title: t("otherSeries.teacherSwapped", { from: name(from), to: name(to), n: r.moved }), color: "success" });
      } else return;
      onClose();
    } catch (e) {
      setError(errOf(e));
    }
  };
  const outcomeKey = to ? scopeOutcomeKey(mode === "swap" ? "swap" : "add", scope) : null;
  const title = mode === "add" ? t("otherSeries.addTeacher") : mode === "remove" ? t("otherSeries.removeTeacherTitle", { name: name(teacherId ?? "") }) : t("otherSeries.swapTeacherTitle", { name: name(from) });
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
        {/* 🔴 TASK-577 (D10) — the COVER rate: shown only for a cover, REQUIRED, and empty by necessity (the only rates
            this screen can see belong to coaches already on the row, which are exactly the ones Swap does not offer). */}
        {/* 🔴 TASK-592 — the reason, in words, where the rate box would be. It names the PERMISSION: 🚫 not the coach, and
            🚫 not the rate — neither of those is what is missing. */}
        {coverBlocked && (
          <Alert color="yellow" variant="light" icon={<AlertTriangle size={15} />} data-cover-needs-key>
            {t("otherSeries.coverNeedsKey")}
          </Alert>
        )}
        {needRate && canRate && (
          <NumberInput
            label={t("otherSeries.coverRate", { name: name(to ?? "") })}
            description={t("otherSeries.coverRateHint")}
            value={rateBaht !== "" ? rateBaht : carried != null ? carried / 100 : ""}
            onChange={(v) => setRateBaht(typeof v === "number" ? v : "")}
            min={0}
            step={50}
            allowDecimal={false}
            allowNegative={false}
            suffix=" ฿"
            required
            className="max-w-xs"
            data-cover-rate={coverRateMinor ?? "none"}
          />
        )}
        {/* 🔴 TASK-624 (1b) — the OPTIONAL rate on "from here on", the group swap's shape (TASK-634): hidden without key 59, never
            greyed; NOT `required`; `value` is the admin's own input and nothing else — no carried rate, and never the outgoing
            teacher's number (that is the exact figure that used to be paid to the wrong person). */}
        {restRate && (
          <NumberInput
            label={t("otherSeries.swapRate", { name: name(to ?? "") })}
            description={t("otherSeries.swapRateHint")}
            value={restRateBaht}
            onChange={(v) => setRestRateBaht(typeof v === "number" ? v : "")}
            min={0}
            step={50}
            allowDecimal={false}
            allowNegative={false}
            suffix=" ฿"
            className="max-w-xs"
            data-swap-rate={restRateBaht === "" ? "none" : bahtToMinor(restRateBaht)}
          />
        )}
        {mode === "add" && canRate && <NumberInput label={t("otherSeries.rateOptional")} value={rateBaht} onChange={(v) => setRateBaht(typeof v === "number" ? v : "")} min={0} step={50} allowDecimal={false} allowNegative={false} suffix=" ฿" className="max-w-xs" />}
        {/* 🔴 TASK-564 — the question, asked. No option is pre-selected, and Save stays shut until one is. */}
        {mode !== "remove" && !isGroupSwap && (
          <Radio.Group label={t("otherSeries.scopeLabel")} description={t("otherSeries.scopeHint")} value={scope ?? ""} onChange={(v) => setScope(v as SeriesScope)} data-series-scope={scope ?? "none"}>
            <Stack gap={4} mt={4}>
              <Radio value="this" label={t("otherSeries.scopeThis")} data-scope-this />
              <Radio value="rest" label={t("otherSeries.scopeRest")} data-scope-rest />
            </Stack>
          </Radio.Group>
        )}
        {/* The label says what the date MEANS in the chosen scope — one session, or the first of the rest. */}
        <DatePickerInput label={t(scopeDateLabelKey(scope))} description={mode === "remove" ? t("otherSeries.fromDateHint") : undefined} value={fromDate} onChange={(v) => v && setFromDate(v)} valueFormat="D MMM YYYY" popoverProps={{ withinPortal: true }} />
        {/* 🔑 A cover and a join are different outcomes with different pay — the screen says which one this is. */}
        {outcomeKey && (
          <Text size="xs" c="dimmed" data-scope-outcome={mode}>
            {mode === "swap" ? t(outcomeKey, { from: name(from), to: name(to ?? "") }) : t(outcomeKey, { name: name(to ?? "") })}
          </Text>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {/* 🔴 TASK-577 — the second guard: a cover with no rate cannot even be pressed. 🚫 An admin WITHOUT key 59
              sees no box and is not blocked here — the server refuses that save, and that hole is reported, not hidden. */}
          <Button
            color={mode === "remove" ? "red" : undefined}
            loading={busy}
            disabled={mode !== "remove" && (!to || !scoped || coverBlocked || (needRate && canRate && coverRateMinor == null))}
            data-teacher-save
            onClick={() => void submit()}
          >
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
