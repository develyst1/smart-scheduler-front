"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Loader, Modal, ScrollArea, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useTeachers } from "@/hooks/scheduler";
// 🔑 straight from the hooks file, NOT the barrel (the same reason as `ChangeTeacherTimeDialog`).
import { useChangePattern, usePreviewChangePattern } from "@/hooks/scheduler/useScheduler";
import WeeklyPatternEditor from "./WeeklyPatternEditor";
import { emptyPatternRow, patternIssue, patternSlots, rowsFromSlots, type PatternRow } from "@/lib/scheduler/weekly-pattern";
import { withoutSystem } from "@/lib/scheduler/teacher";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";
import { notify } from "@/lib/ui/notify";
import type { ChangePatternAnswer, CoursePatternSlot } from "@/types/api/contract";

/** The refusals SB sends as their OWN code — each has its own sentence under `changePattern.err`; any other code (incl. a 400 `VALIDATION`) shows the server's own message. */
// ⚠️ NOT `OUTSIDE_WORK_HOURS` (SB builds it with `badRequest`, so it arrives as `400 VALIDATION`) and NOT `VALIDATION` itself: that one carries a COMPLETE Thai sentence (the hours refusal, a bad pattern) and is shown AS IS,
// the same as any code with no sentence of ours.
const KNOWN_CODES = ["SLOT_TAKEN", "DAY_CLOSED", "TEACHER_ON_LEAVE"] as const;

type Row = { date: string; status: string; bookingType?: string; startTime: string; teacher: { id: string } | null };

/**
 * 🔴 D-157-2's lesson, again — **where the course is NOW is read from its REMAINING rows, never from the first row of the plan** (that one is often an attended row of an old pattern).
 * The first non-extra row with a live status dated today or later (the next untaught class); none ⇒ the last non-extra row.
 */
export const nextUntaughtRow = <T extends Row>(sessions: readonly T[], today: string): T | null => {
  const course = sessions.filter((s) => s.bookingType !== "SINGLE_SESSION");
  const dead = ["ATTENDED", "CANCELLED", "SICK_LEAVE", "NO_SHOW"];
  return course.find((s) => !dead.includes(s.status) && s.date >= today) ?? course[course.length - 1] ?? null;
};

/** The editor's opening rows: the course's `slots` when it has 2+, else its ONE weekly class (weekday · time · coach of the next untaught row). Never the plan's first row. */
export const openingRows = (slots: readonly CoursePatternSlot[] | null | undefined, oneSlot: { weekday: number; startTime: string; teacherId: string | null } | null): PatternRow[] => {
  if (slots && slots.length >= 2) return rowsFromSlots(slots);
  if (oneSlot) return [{ weekday: oneSlot.weekday, startTime: oneSlot.startTime.slice(0, 5), teacherId: oneSlot.teacherId }];
  return [emptyPatternRow()];
};

/** Two editor states are the same pattern when they hold the same `weekday · startTime · teacherId` set — row order does not matter. */
export const samePattern = (a: readonly PatternRow[], b: readonly PatternRow[]): boolean => {
  const keys = (rs: readonly PatternRow[]) => rs.map((r) => `${r.weekday ?? ""}|${(r.startTime ?? "").slice(0, 5)}|${r.teacherId ?? ""}`).sort();
  const ka = keys(a);
  const kb = keys(b);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
};

interface Props {
  opened: boolean;
  courseId: string | null;
  /** The course DTO's `slots` (2+ ⇒ a pattern; `null` / absent ⇒ one weekly class). */
  slots?: CoursePatternSlot[] | null;
  /** The ONE weekly class when `slots` is `null`: taken from the next untaught row. */
  oneSlot: { weekday: number; startTime: string; teacherId: string | null } | null;
  /** The next untaught row's date — the dialog opens on it. */
  defaultFromDate: string;
  program?: string | null;
  student?: string | null;
  onClose: () => void;
  /** Called once the act has happened (the course and the calendar are already re-read). */
  onDone?: () => void;
}

/**
 * 🔴 **TASK-972 (REQ-5016 F1, SPEC-109 § 3.4) — «เปลี่ยนตารางเรียนรายสัปดาห์»: the untaught rest of a course is re-placed onto a new weekly pattern, from a date.**
 *
 * 🔑 The pattern is edited in Flash's `WeeklyPatternEditor`, as is. **One preview request per edit** (debounced): the effect depends on the INPUTS ONLY — never on the answer (D-157-1: an answer that
 * feeds the next request is a loop). Every row, date and count shown is the server's (the preview is the act in a rolled-back transaction): nothing is expanded or counted here.
 * The confirm waits for the answer to THESE inputs.
 */
export default function ChangePatternDialog({ opened, courseId, slots, oneSlot, defaultFromDate, program, student, onClose, onDone }: Props) {
  const t = useT();
  const preview = usePreviewChangePattern();
  const act = useChangePattern();
  const { data: allTeachers = [] } = useTeachers();
  const teachers = withoutSystem(allTeachers);

  const [fromDate, setFromDate] = useState<string>(defaultFromDate);
  const [rows, setRows] = useState<PatternRow[]>(() => openingRows(slots, oneSlot));
  const [answer, setAnswer] = useState<{ key: string; a: ChangePatternAnswer } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // seeded on OPEN
  useEffect(() => {
    if (!opened) return;
    setFromDate(defaultFromDate);
    setRows(openingRows(slots, oneSlot));
    setAnswer(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, courseId]);

  const sendable = !!fromDate && patternIssue(rows) === null && patternSlots(rows).length >= 1;
  const pattern = sendable ? patternSlots(rows) : null;
  // The inputs of THIS moment, as one string: an answer is only good for the key it was asked for.
  const key = pattern ? `${fromDate}|${JSON.stringify(pattern)}` : "";

  const errorText = (e: unknown): string => {
    const code = (e as { code?: unknown } | null)?.code;
    const message = e instanceof Error ? e.message : "";
    if (typeof code === "string" && (KNOWN_CODES as readonly string[]).includes(code)) return t(`changePattern.err.${code}`, { detail: message });
    return message || t("plan.genericError");
  };
  // the debounced request outlives the render that scheduled it: it must speak in the CURRENT language, not the one of that render
  const errorTextRef = useRef(errorText);
  errorTextRef.current = errorText;

  // 🔑 the dry run — debounced, ONE request per change of the inputs. A late answer to an OLD input never replaces the current one.
  const seq = useRef(0);
  useEffect(() => {
    if (!opened || !courseId || !pattern) return;
    const mine = ++seq.current;
    setError(null); // a refusal belongs to the inputs that earned it
    const timer = setTimeout(() => {
      preview
        .mutateAsync({ courseId, fromDate, pattern })
        .then((a) => mine === seq.current && setAnswer({ key, a }))
        .catch((e) => mine === seq.current && setError(errorTextRef.current(e)));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, courseId, key]);

  const fresh = answer && answer.key === key ? answer.a : null;
  // 🔴 Amendment 1b — an UNTOUCHED pattern moves nothing real (the act would only set rows back to PENDING): Confirm needs the rows to differ from the opening ones. A changed from-date alone does not count.
  const unchanged = samePattern(rows, openingRows(slots, oneSlot));
  const canConfirm = !!courseId && !!pattern && !!fresh && fresh.moved > 0 && !unchanged && !act.isPending;

  const submit = async () => {
    if (!courseId || !pattern) return;
    setError(null);
    try {
      await act.mutateAsync({ courseId, fromDate, pattern });
      notify({ title: t("changePattern.done"), color: "success" });
      onDone?.();
      onClose();
    } catch (e) {
      setError(errorText(e)); // the server refused: nothing was written
    }
  };

  const coachOf = (r: ChangePatternAnswer["rows"][number]) => r.teacher?.nickname || r.teacher?.name || "";

  return (
    <Modal opened={opened} onClose={onClose} centered radius="lg" size="lg" scrollAreaComponent={ScrollArea.Autosize} title={t("changePattern.title")}>
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light" data-change-pattern-error>
            {error}
          </Alert>
        )}
        {program || student ? (
          <Text fz="xs" c="dimmed">
            {[program, student].filter(Boolean).join(" · ")}
          </Text>
        ) : null}

        <DatePickerInput
          label={t("changePattern.fromDate")}
          value={fromDate}
          onChange={(v) => v && setFromDate(v)}
          valueFormat="D MMM YYYY"
          minDate={new Date()}
          required
          popoverProps={{ withinPortal: true }}
          styles={{ input: { textAlign: "left" } }}
          data-change-pattern-from
        />
        <Stack gap={4}>
          <Text fz="sm" fw={500}>
            {t("changePattern.pattern")}
          </Text>
          <WeeklyPatternEditor rows={rows} onChange={setRows} teachers={teachers} seedTeacherId={oneSlot?.teacherId ?? null} hideHints />
        </Stack>

        {pattern && !error ? (
          fresh ? (
            <Stack gap={4} data-change-pattern-preview>
              <Text fz="sm" className="tabular-nums" data-change-line>
                {fresh.moved === 0 ? t("changePattern.none") : t(fresh.moved === 1 ? "changePattern.previewLineOne" : "changePattern.previewLine", { moved: fresh.moved, fromDate: formatDateDisplay(fromDate) })}
              </Text>
              {fresh.rows.length > 0 && (
                <ScrollArea.Autosize mah={220}>
                  <Stack gap={2}>
                    {fresh.rows.map((r) => {
                      const when = { date: formatDateDisplay(r.date), time: formatTimeDisplay(r.startTime) }; // formatted BEFORE the `t()` call (the repo's t-arg sweep)
                      return (
                        <Text key={r.id} fz="xs" c="dimmed" className="tabular-nums" data-change-pattern-row>
                          {t("changePattern.rowLine", { ...when, coach: coachOf(r) })}
                        </Text>
                      );
                    })}
                  </Stack>
                </ScrollArea.Autosize>
              )}
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
