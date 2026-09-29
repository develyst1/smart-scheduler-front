"use client";

import { useState } from "react";
import { Alert, Button, Group, List, Modal, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle, CalendarArrowUp, Info } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useChangeCourseStart, useCourseExpiryHistory, usePreviewCourseStart } from "@/hooks/scheduler";
import { expirySetByHand, forecastMoves, startChangeWarnings, type StartChangeForecast, type StartChangeResult } from "@/lib/scheduler/course-start";
import { formatDateDisplay } from "@/lib/ui/format";
import type { CoursePackageView } from "@/types/app/scheduler";

/**
 * REQ-110 item 6 (TASK-571) — **move a not-yet-started course's start date.**
 *
 * 🔴 **The thing this dialog exists to say out loud:** the server moves the sessions and **tells nobody**. A confirmed
 * session drops back to PENDING with `needsReconfirm`, and **until an admin runs Confirm-course the family and the coach
 * still hold the OLD dates.** ⇒ that sentence is **on the screen, before and after the move** — *not in a toast that
 * disappears* — with what to do about it.
 *
 * 🚫 **Nothing here predicts the plan.** 🔻 **TASK-574 — there IS a preview route now** (`POST /courses/:id/start-date/preview`,
 * the act's own plan lifted verbatim), so the dialog asks it and renders **the server's own** moves, expiry and skipped
 * weeks; until that answer exists it states only what is true of EVERY move. 🔑 Guessing any of it here would mean a
 * second copy of `planCourseStartChange` — the rule that decides dates and money — and *a screen that predicts
 * differently from the server is worse than one that waits.*
 * 📌 **This paragraph used to say "there is no preview route", and TASK-574 made it false without touching the comment.**
 *
 * ⚠️ **A hand-set expiry is named before committing**, read from the expiry history (a row with an actor = a person's
 * deliberate date): *replacing a colleague's date without saying so is the silent-undo problem wearing different clothes.*
 */
export default function ChangeStartDateDialog({ course, onClose }: { course: CoursePackageView | null; onClose: () => void }) {
  const t = useT();
  const move = useChangeCourseStart();
  const preview = usePreviewCourseStart();
  const { data: history } = useCourseExpiryHistory(course?.id ?? null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StartChangeResult | null>(null);
  /**
   * 🔻 TASK-574 — the FORECAST, and the refusal a forecast can carry. 🔑 **Nothing may be committed before one exists**:
   * the admin sees the dates that would move and the weeks that would be skipped, from the server, before they decide.
   */
  const [forecast, setForecast] = useState<StartChangeForecast | null>(null);

  if (!course) return null;
  const handSet = expirySetByHand(history);

  /** 🔻 TASK-574 — ask what it WOULD do. A refusal here blocks the commit, in the server's own words (TASK-547's rule). */
  const ask = async () => {
    if (!startDate) return;
    setError(null);
    setForecast(null);
    try {
      setForecast(await preview.mutateAsync({ courseId: course.id, startDate }));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  const submit = async () => {
    // 🚫 No date and no FORECAST, no request — and the button is disabled too (two guards, TASK-564's lesson).
    if (!startDate || !forecast) return;
    setError(null);
    try {
      setResult(await move.mutateAsync({ courseId: course.id, startDate }));
    } catch (e) {
      // 🔴 The server's own sentence: a clash names the date, a started course says why. The course is untouched.
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  const close = () => {
    setStartDate(null);
    setError(null);
    setResult(null);
    setForecast(null);
    onClose();
  };

  return (
    <Modal opened onClose={close} centered title={t("courseStart.title", { student: course.studentName })} data-start-dialog={result ? "done" : "ask"}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" variant="light" icon={<AlertTriangle size={15} />} data-start-error>
            {error}
          </Alert>
        )}

        {!result ? (
          <>
            <DatePickerInput
              label={t("courseStart.newStart")}
              /* 🔻 TASK-574 — the current date is REAL now (TASK-573 sends `CourseSummary.startDate`), so the hint says it
                 instead of apologising for not knowing it. 📌 TASK-545's invented `""` is what made this a compile error
                 rather than a wrong screen — the field arriving is the whole of the fix. */
              description={t("courseStart.newStartHintCurrent", { current: formatDateDisplay(course.startDate) })}
              value={startDate}
              /* 🔑 A new date makes the old forecast a lie about a different plan, so it goes with the date. */
              onChange={(v) => {
                setStartDate(v);
                setForecast(null);
                setError(null);
              }}
              valueFormat="D MMM YYYY"
              required
              popoverProps={{ withinPortal: true }}
            />
            {/* 🔑 Said BEFORE committing, every time — the stale-schedule window first, because it is the one an admin
                cannot see and the one that reaches a family. */}
            <Alert color="orange" variant="light" icon={<Info size={16} />} data-start-warnings={handSet ? "hand-set" : "plain"}>
              <List size="sm" spacing={4}>
                {startChangeWarnings({ handSetExpiry: handSet }).map((key) => (
                  <List.Item key={key}>{t(key)}</List.Item>
                ))}
              </List>
            </Alert>
            {/* 🔻 TASK-574 — what it WOULD do, from the server's own plan. 🚫 Not one date is computed here. */}
            {forecast && (
              <Stack gap={4} data-start-forecast={forecastMoves(forecast).length}>
                <Text size="sm" fw={500}>
                  {t("courseStart.forecastTitle", { n: forecastMoves(forecast).length })}
                </Text>
                <List size="sm" spacing={2}>
                  {forecastMoves(forecast).map((m) => (
                    <List.Item key={`${m.from}->${m.to}`}>{t("courseStart.forecastRow", { from: formatDateDisplay(m.from), to: formatDateDisplay(m.to) })}</List.Item>
                  ))}
                </List>
                <Text size="sm">
                  {t("courseStart.expiryMoved", { from: formatDateDisplay(forecast.previousExpiryDate), to: formatDateDisplay(forecast.expiryDate) })}
                </Text>
                {forecast.skippedForLeave.length > 0 && (
                  <Alert color="yellow" variant="light" icon={<Info size={16} />} title={t("courseStart.skippedTitle")} data-forecast-skipped={forecast.skippedForLeave.length}>
                    <List size="sm" spacing={2}>
                      {forecast.skippedForLeave.map((d) => (
                        <List.Item key={d}>{formatDateDisplay(d)}</List.Item>
                      ))}
                    </List>
                  </Alert>
                )}
                {/* 🔑 `forecast: true` IN WORDS, and deliberately TASK-547's sentence: the act checks again, so a refusal
                    after this is an ordinary outcome and not a contradiction. The two screens are one product. */}
                <Text size="xs" c="dimmed" data-start-forecast-caveat>
                  {t("courseStart.forecastCaveat")}
                </Text>
              </Stack>
            )}
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={close}>
                {t("common.cancel")}
              </Button>
              {/* 🚫 The commit is a SEPARATE act and is unreachable until a forecast exists — a refused one leaves it shut. */}
              <Button variant="light" loading={preview.isPending} disabled={!startDate} data-start-preview onClick={() => void ask()}>
                {t("courseStart.preview")}
              </Button>
              <Button
                leftSection={<CalendarArrowUp size={15} />}
                loading={move.isPending}
                disabled={!startDate || !forecast}
                data-start-confirm
                onClick={() => void submit()}
              >
                {t("courseStart.confirm")}
              </Button>
            </Group>
          </>
        ) : (
          /* 🔑 The answer, as sent: how many moved, the new expiry beside the old one, the weeks the plan STEPPED OVER,
             and the reconfirm window with the act that closes it. 🚫 Nothing here is computed. */
          <Stack gap="sm" data-start-result={result.moved}>
            <Text fw={600}>{t("courseStart.doneTitle", { n: result.moved, date: formatDateDisplay(result.startDate) })}</Text>
            <Text size="sm">
              {t("courseStart.expiryMoved", { from: formatDateDisplay(result.previousExpiryDate), to: formatDateDisplay(result.expiryDate) })}
            </Text>
            {result.skippedForLeave.length > 0 && (
              /* ⚠️ Without this an admin cannot understand the end date: the plan stepped over a week the coach is away. */
              <Alert color="yellow" variant="light" icon={<Info size={16} />} title={t("courseStart.skippedTitle")} data-start-skipped={result.skippedForLeave.length}>
                <List size="sm" spacing={2}>
                  {result.skippedForLeave.map((d) => (
                    <List.Item key={d}>{formatDateDisplay(d)}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            {result.needsReconfirm > 0 && (
              /* 🔴 The window, stated again where the admin is now looking, with the act that closes it. */
              <Alert color="orange" variant="light" icon={<AlertTriangle size={16} />} title={t("courseStart.reconfirmTitle", { n: result.needsReconfirm })} data-start-reconfirm={result.needsReconfirm}>
                {t("courseStart.reconfirmBody")}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t("common.close")}
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
