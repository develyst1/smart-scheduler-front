"use client";

import { Alert, List, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { formatDateDisplay } from "@/lib/ui/format";
import { useT } from "@/lib/i18n";
import type { ExpiryWarning } from "@/types/api/contract";

/** How many outside sessions to list before summarising the rest. A long list stops being read. */
const MAX_LISTED = 5;

/**
 * SPEC-076 / TASK-265 — **the ONE expiry warning**, shared by REQ-082's expiry edit and REQ-084's resume.
 *
 * 🔑 Both endpoints return the identical `expiryWarning` shape, and that is the whole reason this is one
 * component: it makes the owner's *"one rule across both"* true **in the code**, not only in the REQ text. A
 * second warning built beside the other is how the two come to say different things about the same fact.
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
            {s.startTime ? ` · ${s.startTime}` : ""}
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
