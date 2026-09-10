"use client";

import { Alert, List, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";
import { useT } from "@/lib/i18n";
import type { ExpiryWarning } from "@/types/api/contract";

/** How many outside sessions to list before summarising the rest. A long list stops being read. */
const MAX_LISTED = 5;

/**
 * SPEC-076 / TASK-265 — the expiry warning for **REQ-082's expiry EDIT**.
 *
 * ⚠️ **It served the resume too, until TASK-287 (2026-09-08). It no longer can, and the reason is worth
 * keeping:** the resume warned that its sessions might fall past the expiry — and the expiry is now **derived
 * from** those sessions, so the condition cannot occur. The BE dropped `expiryWarning` from that response
 * entirely. ⇒ **one caller now, deliberately, not by neglect.**
 *
 * 🔑 It stays a shared component rather than being folded into `EditExpiryDialog`, because the EDIT verb is the
 * one that genuinely still has a question to answer: it takes a date the admin chose and has nothing to infer
 * from, so it can still leave sessions outside. If a second caller ever needs this warning again, the reason
 * to have exactly one of these is unchanged.
 *
 * 🚫 **It computes nothing.** `warn`, `outside` and `outsideCount` are the server's; this renders them. The BE
 * derives all three from one `expiryImpact` used by both paths, so re-deriving here would be a second opinion
 * about a question that already has an answer — the same rule TASK-261 applied to the clash message.
 *
 * 🔴 **It is a WARNING, never a gate.** REQ-082 AC-4 is *warn, and still save*: the owner's rule is "warn, do
 * not act", and a dialog the admin cannot get past is acting. So this component renders and returns — it owns
 * no button, disables nothing, and callers must not use `warn` to block their own submit.
 */
export default function ExpiryWarningAlert({ warning }: { warning: ExpiryWarning | null | undefined }) {
  const t = useT();
  // Not an error state and not an empty box: nothing outside the window means there is nothing to say.
  if (!warning?.warn) return null;

  const listed = warning.outside.slice(0, MAX_LISTED);
  const rest = warning.outsideCount - listed.length;

  return (
    <Alert color="orange" variant="light" icon={<AlertTriangle size={16} />} title={t("expiry.warnTitle")}>
      <Text fz="sm">
        {t("expiry.warnBody", {
          n: warning.outsideCount,
          date: formatDateDisplay(warning.expiryDate),
        })}
      </Text>
      {/* AC-4 asks WHICH sessions, not how many — the count alone tells an admin nothing they can act on. */}
      <List size="sm" mt={6} withPadding>
        {listed.map((s, i) => (
          <List.Item key={s.id ?? `${s.date}-${i}`}>
            {formatDateDisplay(s.date)}
            {/* 🔴 TASK-324 — one of only TWO sites that could actually show `15:00:00`: the expiry DTO ships
                `startTime` RAW (`expiryDecision`'s `candidates` map applies no `hhmm()`), unlike the booking
                DTO. The separator stays local — the helper formats one time, not a range. */}
            {s.startTime ? ` · ${formatTimeDisplay(s.startTime)}` : ""}
          </List.Item>
        ))}
      </List>
      {rest > 0 && (
        <Text fz="xs" c="dimmed" mt={4}>
          {t("expiry.warnMore", { n: rest })}
        </Text>
      )}
      {/* Says plainly that saving is still allowed, so the warning does not read as a refusal. */}
      <Text fz="xs" c="dimmed" mt={6}>
        {t("expiry.warnStillSaves")}
      </Text>
    </Alert>
  );
}
