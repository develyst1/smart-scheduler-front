"use client";

import { Text } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { useLeavePreview } from "@/hooks/scheduler";

/**
 * 🔴 **TASK-818 (P7) → TASK-828 (REQ-125 ruling B) — what saving WILL do, said plainly BEFORE it is done, from the server's PREVIEW.**
 *
 * 🔑 **Why a preview and not the numbers the dialog holds:** whether a co-taught class CONTINUES depends on whether ANOTHER teacher of it remains (not on leave that day) — a fact the
 * calendar rows (\`additionalTeachers\`) do not carry. The server answers it with the same decision the act makes ("preview = act"), so these lines can never promise what the act will not
 * do. 🚫 Until the preview has answered (or if it fails) NOTHING is said: a count we cannot back is worse than none.
 * - **The teacher's own door:** today ⇒ "cancels N class(es) and tells their families" with N = the TICKED classes the preview does not say continue, plus the approved "{n} co-taught
 *   class(es) go on with the other teachers, without you."; a future day ⇒ "only blocks … N class(es) stay" with N = what is left to handle (the last-teacher and D4 ones).
 * - **The admin's door:** the approved "{n} co-taught class(es) will go on with the other teachers; {name} is taken off them." (its own hint above already says the rest).
 * 📌 In its own component so the dialog file holds no new data hook (TASK-406's pin lists the only ones it may).
 */
export default function LeaveWillDo({
  ready,
  adminFor,
  date,
  to,
  advance,
  ticked,
}: {
  /** a date is chosen, no teacher is still to be picked, and no range refusal stands */
  ready: boolean;
  /** the admin door: whose leave (the preview is of THAT teacher); `null` = the teacher's own door */
  adminFor: { id: string; name: string } | null;
  date: string;
  /** the last day asked about (= `date` for one day) */
  to: string;
  advance: boolean;
  /** the own door's ticked class ids (what the teacher chose to cancel) */
  ticked: readonly string[];
}) {
  const t = useT();
  // the admin door only previews an ADVANCE span (today / the past is refused there); the own door previews any day
  const { data } = useLeavePreview(adminFor?.id ?? null, date, to, ready && (adminFor ? advance : true));
  const counts = data?.counts;
  if (!ready || !counts) return null;

  if (adminFor) {
    return counts.continues > 0 ? (
      <Text size="sm" fw={500} data-leave-co-taught="admin">
        {t("teacherLeave.coTaughtAdmin", { n: counts.continues, name: adminFor.name })}
      </Text>
    ) : null;
  }

  const outcome = new Map(data.days.flatMap((d) => d.classes.map((c) => [c.bookingId, c.outcome] as const)));
  if (advance) {
    const n = counts.toHandle + counts.cannot;
    return (
      <Text size="sm" fw={500} data-leave-will="block">
        {t("teacherLeave.willBlock", { n })}
      </Text>
    );
  }
  const cancelN = ticked.filter((id) => outcome.get(id) !== "continues").length;
  if (cancelN === 0 && counts.continues === 0) return null;
  return (
    <>
      {cancelN > 0 && (
        <Text size="sm" fw={500} data-leave-will="cancel">
          {t("teacherLeave.willCancel", { n: cancelN })}
        </Text>
      )}
      {counts.continues > 0 && (
        <Text size="sm" fw={500} data-leave-co-taught="own">
          {t("teacherLeave.coTaughtOwn", { n: counts.continues })}
        </Text>
      )}
    </>
  );
}
