"use client";

import { Text } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { formatTimeDisplay } from "@/lib/ui/format";
import { useLeavePreview } from "@/hooks/scheduler";

/**
 * 🔴 **TASK-818 (P7) → TASK-828 (REQ-125 ruling B) — what saving WILL do, said plainly BEFORE it is done, from the server's PREVIEW.**
 *
 * 🔑 **Why a preview and not the numbers the dialog holds:** whether a co-taught class CONTINUES depends on whether ANOTHER teacher of it remains (not on leave that day) — a fact the
 * calendar rows (\`additionalTeachers\`) do not carry. The server answers it with the same decision the act makes ("preview = act"), so these lines can never promise what the act will not
 * do. 🚫 Until the preview has answered (or if it fails) NOTHING is said: a count we cannot back is worse than none.
 * - **The teacher's own door** (TEST-111, TASK-828 rework + F3): every number comes from the preview's per-class OUTCOMES — never from the session list, and **never from `day.counts`
 *   (the WHOLE day)**. **Today:** the act touches ONLY the ticked sessions (`sessionIds`), so EVERY line follows the ticks — the preview's `classes` are first filtered to the ticked ids, and the
 *   cancel count, the co-taught count and the D4 sentence all come from that filtered list ("cancels N class(es) and tells their families": the ticked `cancel`s; a `cannot` — D4, left as it
 *   is, no family told — is not a cancel, nor is a `continues`; the approved co-taught line and D4 sentence only for ticked classes). **A future day** records the WHOLE day (no chooser, no
 *   ticks): "only blocks … N class(es) stay" = `toHandle` + `cannot`, plus the same co-taught line and D4 sentences, over every class.
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
  ownRows,
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
  /** the own door's classes of the day (the calendar read) — ONLY to name the teacher a D4 sentence is about; never a count */
  ownRows: readonly { id: string; teachers: readonly { name: string; nickname?: string | null }[] }[];
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

  const day = data.days.flatMap((d) => d.classes);
  // 🔴 F3 — the scope of what saving touches: today ⇒ only the TICKED classes (preview = act on the same ids); an advance day ⇒ the whole day. Every count below comes from THIS list.
  const tickedIds = new Set(ticked);
  const scope = advance ? day : day.filter((c) => tickedIds.has(c.bookingId));
  // D4: the class stays as it is. The sentence names the MAIN teacher of that class (on the own door, that is the teacher themself — the only case a D4 can arise)
  const d4 = scope
    .filter((c) => c.outcome === "cannot")
    .flatMap((c) => {
      const main = ownRows.find((r) => r.id === c.bookingId)?.teachers[0];
      const name = main?.nickname || main?.name;
      const time = formatTimeDisplay(c.startTime); // formatted BEFORE it reaches `t()` (the shape sweep's rule)
      return name ? [{ id: c.bookingId, text: t("teacherLeave.cannotTakeOff", { name, time }) }] : [];
    });
  const cancelN = scope.filter((c) => c.outcome === "cancel").length;
  const continuesN = scope.filter((c) => c.outcome === "continues").length;
  const blockN = scope.filter((c) => c.outcome === "toHandle" || c.outcome === "cannot").length;
  const showBlock = advance; // a future day always says what saving does (it may be "0 class(es) stay")
  const showCancel = !advance && cancelN > 0;
  if (!showBlock && !showCancel && continuesN === 0 && d4.length === 0) return null;
  return (
    <>
      {showBlock && (
        <Text size="sm" fw={500} data-leave-will="block">
          {t("teacherLeave.willBlock", { n: blockN })}
        </Text>
      )}
      {showCancel && (
        <Text size="sm" fw={500} data-leave-will="cancel">
          {t("teacherLeave.willCancel", { n: cancelN })}
        </Text>
      )}
      {continuesN > 0 && (
        <Text size="sm" fw={500} data-leave-co-taught="own">
          {t("teacherLeave.coTaughtOwn", { n: continuesN })}
        </Text>
      )}
      {d4.map((x) => (
        <Text key={x.id} size="xs" c="orange" data-leave-d4={x.id}>
          {x.text}
        </Text>
      ))}
    </>
  );
}
