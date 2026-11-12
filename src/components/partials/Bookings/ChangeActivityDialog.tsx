"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, Loader, Modal, NumberInput, ScrollArea, Select, Stack, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useTeachers } from "@/hooks/scheduler";
// 🔑 straight from the hooks file, NOT the barrel (the same reason as `ChangeTeacherTimeDialog`): other test files stub `@/hooks/scheduler` with a hand-written export list.
import { useChangeActivity, usePreviewChangeActivity } from "@/hooks/scheduler/useScheduler";
import { useSellablePackages } from "@/hooks/scheduler/usePricing";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { resumeTeacherIdToSend, resumeTeacherOptions } from "@/lib/scheduler/resume-teacher";
import { formatDateDisplay } from "@/lib/ui/format";
import { notify } from "@/lib/ui/notify";
import { formatPriceMinor } from "@/types/app/pricing";
import type { ChangeActivityAnswer } from "@/types/api/contract";

/** Every refusal of SPEC-106 § 2.1 / § 2.2 — each has its own sentence under `changeActivity.err`. An UNKNOWN code shows the server's message. */
const KNOWN_CODES = [
  "SAME_ACTIVITY",
  "MANUAL_PRICE_NOT_ALLOWED",
  "MANUAL_PRICE_REQUIRED",
  "MANUAL_PRICE_RANGE",
  "NO_REMAINING_CLASSES",
  "COURSE_ENDED",
  "COURSE_PAUSED",
  "COURSE_DROPPED", // the code SB actually sends for a paused course (SB contract comment); COURSE_PAUSED kept in case
  "OLD_PRICE_NOT_ON_CARD",
  "NOT_LIVE_BOOKING",
  "GROUP_COURSE",
  "SLOT_TAKEN",
  "NOT_SINGLE_OR_TRIAL",
  "ALREADY_DELIVERED",
  "NO_PRICE_GROUP",
] as const;

/**
 * 🔴 D-157-2 — **the course's CURRENT activity is the one its REMAINING rows carry** (SPEC-106 § 1: the set the server changes), never the first row of the plan (often an attended one with the OLD activity).
 * The first non-extra row with a live status dated today or later; none ⇒ the last non-extra row.
 */
export const currentActivityOf = (
  sessions: ReadonlyArray<{ date: string; status: string; bookingType?: string; subject: { id: string; name: string } | null }>,
  today: string,
): { id: string; name: string } | null => {
  const course = sessions.filter((s) => s.bookingType !== "SINGLE_SESSION");
  const dead = ["ATTENDED", "CANCELLED", "SICK_LEAVE", "NO_SHOW"];
  const remaining = course.find((s) => !dead.includes(s.status) && s.date >= today);
  return (remaining ?? course[course.length - 1] ?? null)?.subject ?? null;
};

/** The typed price: a whole number of baht, 1..100000 — anything else is `null` (never sent). */
export const parseManualPrice = (v: number | string): number | null => {
  const n = typeof v === "number" ? v : v.trim() === "" ? NaN : Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : null;
};

interface Props {
  opened: boolean;
  /** `course` = the rest of a course (the typed price may apply); `booking` = ONE 1 HR / Trial (never a typed price). */
  target: "course" | "booking";
  id: string | null;
  /** The CURRENT activity — left out of the list. By id when the caller has one (a course row), else by name (a booking carries the name only). */
  current: { id?: string | null; name?: string | null } | null;
  currentTeacherId?: string | null;
  program?: string | null;
  student?: string | null;
  onClose: () => void;
  /** Called once the act has happened (the course / calendar are already re-read). */
  onDone?: () => void;
}

/**
 * 🔴 **TASK-962 (REQ-5014, SPEC-106 § 7) — «เปลี่ยนกิจกรรม»: the rest of a course (or ONE 1 HR / Trial) moves to another activity, from the next class.**
 *
 * 🔑 Modelled on `ChangeTeacherTimeDialog`: the same coach picker, a debounced dry run on every change (a late answer to an OLD input never replaces the current one),
 * and the confirm waits for the answer to THESE inputs. **Every number is the server's** — remaining, first date, both prices, the difference: nothing is counted here.
 * 📌 The typed-price field exists ONLY after a preview said `newPriceMinor: null`, and never on a 1 HR / Trial (every group has a 1 h price; a Trial is flat).
 * 📌 A difference above 0 is the admin's to record by hand at Add Manually (Team C's form): the success state says so, as TEXT (the deep link waits for Sector).
 */
export default function ChangeActivityDialog({ opened, target, id, current, currentTeacherId = null, program, student, onClose, onDone }: Props) {
  const t = useT();
  const preview = usePreviewChangeActivity();
  const act = useChangeActivity();
  const { data: teachers = [] } = useTeachers();
  const { data: sellable } = useSellablePackages();

  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null); // null = keep the current coach (the key is not sent)
  const [priceText, setPriceText] = useState<number | string>("");
  /** The subject whose last preview said `newPriceMinor: null` — the typed-price field stays mounted while the next preview is in flight. */
  const [needsPriceFor, setNeedsPriceFor] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ key: string; a: ChangeActivityAnswer } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Set when the act left a difference to record — the dialog then stays open to say so. */
  const [recordDiff, setRecordDiff] = useState<number | null>(null);

  // The list: every active subject the price card sells (any size), minus the unpriced ones, minus the current one.
  const subjects = useMemo(() => {
    const unpriced = new Set((sellable?.unpricedSubjects ?? []).map((s) => s.id));
    const seen = new Map<string, string>();
    for (const p of sellable?.packages ?? []) for (const s of p.subjects) if (!unpriced.has(s.id)) seen.set(s.id, s.name);
    return [...seen.entries()]
      .filter(([sid, name]) => !(current?.id ? sid === current.id : !!current?.name && name === current.name))
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sellable, current?.id, current?.name]);
  const newSubject = subjects.find((s) => s.value === subjectId);
  const teacherOptions = resumeTeacherOptions(teachers, currentTeacherId, null, subjectId ? { id: subjectId, name: newSubject?.label } : null);

  const typedBaht = parseManualPrice(priceText);
  const priceTyped = priceText !== "" && String(priceText).trim() !== "";
  const showPrice = target === "course" && !!subjectId && needsPriceFor === subjectId;
  const sendBaht = showPrice && typedBaht !== null ? typedBaht : undefined;
  const sendTeacher = resumeTeacherIdToSend(teacherId, currentTeacherId);
  // The inputs of THIS moment, as one string: an answer is only good for the key it was asked for.
  const key = `${subjectId ?? ""}|${sendTeacher ?? ""}|${sendBaht ?? ""}`;

  // seeded on OPEN
  useEffect(() => {
    if (!opened) return;
    setSubjectId(null);
    setTeacherId(null);
    setPriceText("");
    setNeedsPriceFor(null);
    setAnswer(null);
    setError(null);
    setRecordDiff(null);
  }, [opened, id]);

  // 🔑 the dry run — debounced, on every change. A late answer to an OLD input never replaces the answer for the current one.
  const seq = useRef(0);
  useEffect(() => {
    if (!opened || !id || !subjectId) return;
    const mine = ++seq.current;
    setError(null); // a refusal belongs to the inputs that earned it
    const timer = setTimeout(() => {
      preview
        .mutateAsync({ target, id, subjectId, ...(sendTeacher ? { teacherId: sendTeacher } : {}), ...(sendBaht !== undefined ? { manualPriceBaht: sendBaht } : {}) })
        .then((a) => {
          if (mine !== seq.current) return;
          setAnswer({ key, a });
          // 🔴 D-157-1 — an answer may only TURN ON the typed-price field (the card has no price for the price-less request); it never turns it OFF. The real server echoes a typed
          // price back as `newPriceMinor`, so "clear it when the answer has a price" dropped the price from the next request, whose answer was `null` again, … = a loop. Only a change of
          // activity (the Select) clears it.
          if (target === "course" && a.newPriceMinor === null && sendBaht === undefined) setNeedsPriceFor(subjectId);
        })
        .catch((e) => mine === seq.current && setError(errorText(e)));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, id, target, key]);

  const errorText = (e: unknown): string => {
    const code = (e as { code?: unknown } | null)?.code;
    const message = e instanceof Error ? e.message : "";
    if (typeof code === "string" && (KNOWN_CODES as readonly string[]).includes(code)) return t(`changeActivity.err.${code}`, { detail: message });
    return message || t("plan.genericError");
  };

  const fresh = answer && answer.key === key ? answer.a : null;
  const priceOk = !showPrice || typedBaht !== null;
  // the act is asked only once the server has answered for THESE inputs, and (when the card has no price) for a typed price it has priced
  const canConfirm = !!id && !!subjectId && !!fresh && priceOk && (!showPrice || fresh.differenceMinor !== null) && !act.isPending;

  const submit = async () => {
    if (!id || !subjectId) return;
    setError(null);
    try {
      const res = await act.mutateAsync({ target, id, subjectId, ...(sendTeacher ? { teacherId: sendTeacher } : {}), ...(sendBaht !== undefined ? { manualPriceBaht: sendBaht } : {}) });
      notify({ title: t("changeActivity.done"), color: "success" });
      if ((res?.differenceMinor ?? 0) > 0) {
        setRecordDiff(res.differenceMinor ?? 0);
        return;
      }
      onDone?.();
      onClose();
    } catch (e) {
      setError(errorText(e)); // the server refused: nothing was written
    }
  };

  const finish = () => {
    onDone?.();
    onClose();
  };

  // The act happened and left a difference to record: say where, with the amount (the deep link waits for Team C's form — until then it is text).
  if (recordDiff !== null) {
    const base = (process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? "").trim().replace(/\/+$/, "");
    const backofficeLink = target === "course" && id && base ? `${base}/revenue/manual?courseId=${encodeURIComponent(id)}&amountMinor=${recordDiff}&reason=activity-change` : null;
    return (
      <Modal opened={opened} onClose={finish} centered radius="lg" title={t("changeActivity.title")}>
        <Stack gap="md">
          <Alert color="blue" variant="light" data-change-activity-record={recordDiff}>
            {t("changeActivity.recordDifference", { x: formatPriceMinor(recordDiff) })}
          </Alert>
          {/* 🔴 SPEC-107 § 3 (Sector) — the back office's Add Manually, prefilled; a COURSE only (a 1 HR has no course to link) and only when the address is configured: unset ⇒ the text alone. */}
          {backofficeLink && (
            <Text fz="sm">
              <a href={backofficeLink} target="_blank" rel="noopener noreferrer" className="underline" data-change-activity-link>
                {t("changeActivity.openAddManually")}
              </a>
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={finish}>
              {t("common.close")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  const a = fresh;
  const shownNewMinor = a ? (a.newPriceMinor ?? (sendBaht !== undefined ? sendBaht * 100 : null)) : null;

  return (
    <Modal opened={opened} onClose={onClose} centered radius="lg" scrollAreaComponent={ScrollArea.Autosize} title={t("changeActivity.title")}>
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light" data-change-activity-error>
            {error}
          </Alert>
        )}
        {program || student ? (
          <Text fz="xs" c="dimmed">
            {[program, student].filter(Boolean).join(" · ")}
          </Text>
        ) : null}

        <Select
          label={t("changeActivity.activity")}
          placeholder={subjects.length === 0 ? t("changeActivity.noActivities") : t("changeActivity.pickActivity")}
          value={subjectId}
          onChange={(v) => {
            setSubjectId(v);
            setPriceText("");
            setNeedsPriceFor(null);
            setAnswer(null);
          }}
          data={subjects}
          searchable
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          data-change-activity-subject
          required
        />
        <Select
          label={t("changeActivity.coach")}
          placeholder={t("changeActivity.keepCoach")}
          value={teacherId}
          onChange={setTeacherId}
          data={teacherSelectData(teacherOptions)}
          renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
          clearable
          comboboxProps={{ withinPortal: true }}
        />

        {/* ⚠️ ONLY when the server said the card has no price for this activity × size; never on a 1 HR / Trial. */}
        {showPrice && (
          <NumberInput
            label={t("changeActivity.manualPrice")}
            description={t("changeActivity.manualPriceHint")}
            value={priceText}
            onChange={setPriceText}
            allowDecimal={false}
            allowNegative={false}
            clampBehavior="none"
            thousandSeparator=","
            suffix=" ฿"
            error={priceTyped && typedBaht === null ? t("changeActivity.err.MANUAL_PRICE_RANGE") : undefined}
            data-manual-price
            required
          />
        )}

        {subjectId && !error ? (
          a ? (
            <Stack gap={4} data-change-activity-preview>
              <Text fz="sm" className="tabular-nums" data-change-line>
                {t(a.remaining === 1 ? "changeActivity.previewLineOne" : "changeActivity.previewLine", { remaining: a.remaining, firstDate: formatDateDisplay(a.firstDate) })}
              </Text>
              {shownNewMinor !== null && (
                <Text fz="sm" className="tabular-nums" data-change-price>
                  {t("changeActivity.priceLine", { old: formatPriceMinor(a.oldPriceMinor), new: formatPriceMinor(shownNewMinor) })}
                  {a.priceSource === "MANUAL" || (a.newPriceMinor === null && sendBaht !== undefined) ? ` · ${t("changeActivity.typedTag")}` : ""}
                </Text>
              )}
              {a.differenceMinor !== null && (
                <Text fz="sm" fw={600} className="tabular-nums" data-change-difference>
                  {a.differenceMinor > 0 ? t("changeActivity.difference", { difference: formatPriceMinor(a.differenceMinor) }) : t("changeActivity.noRefund")}
                </Text>
              )}
              <Text fz="xs" c="dimmed">
                {t("changeActivity.attendedKept")}
              </Text>
            </Stack>
          ) : (
            <Group justify="center" py="xs">
              <Loader size="sm" />
            </Group>
          )
        ) : null}

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="blue" loading={act.isPending} disabled={!canConfirm} onClick={submit}>
            {t("common.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
