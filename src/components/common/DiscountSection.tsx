"use client";

import { useSession } from "next-auth/react";
import { Alert, Group, NumberInput, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatPriceMinor } from "@/types/app/pricing";
import { evaluateDiscount, type DiscountDraft } from "@/lib/scheduler/discount";

interface Props {
  /** The price the discount applies to, in minor units. Rental = hours × rate (AC-14) — the caller recomputes. */
  fullMinor: number;
  value: DiscountDraft;
  onChange: (next: DiscountDraft) => void;
  /** Server refusal text from `DISCOUNT_REFUSED` → `details.problems`. Rendered in full, never just the first. */
  serverProblems?: string[];
}

/**
 * The Discount block shared by all five sale/booking forms (REQ-063 / TASK-161).
 *
 * Three things it deliberately does NOT do:
 *  - it never clamps a too-large value to the price (that would turn a typo into a free sale — the form refuses);
 *  - it never decides what is posted (the caller sends `discountPayload`, and the **server** re-validates);
 *  - it renders nothing at all for a non-admin. That is a courtesy, not the control: `assertMayDiscount` 403s
 *    server-side regardless. (One role exists today, so in practice every authenticated user is admin; the gate is
 *    wired now so it is already correct the day a staff role lands.)
 */
export default function DiscountSection({ fullMinor, value, onChange, serverProblems = [] }: Props) {
  const t = useT();
  const { data: session } = useSession();
  if (session?.user?.role !== "admin") return null;

  const { discountMinor, problemKeys, netMinor, touched } = evaluateDiscount(value, fullMinor);

  return (
    <Stack gap="xs">
      <Text fw={600} fz="sm">
        {t("discount.section")}
      </Text>

      <Group grow align="flex-start" wrap="wrap">
        <SegmentedControl
          value={value.kind}
          onChange={(k) => onChange({ ...value, kind: k as DiscountDraft["kind"] })}
          data={[
            { value: "PERCENT", label: t("discount.percent") },
            { value: "BAHT", label: t("discount.baht") },
          ]}
        />
        <NumberInput
          aria-label={t("discount.section")}
          placeholder={value.kind === "PERCENT" ? "10" : "100"}
          value={value.value}
          onChange={(v) => onChange({ ...value, value: typeof v === "number" ? v : "" })}
          min={0}
          allowNegative={false}
          allowDecimal={value.kind === "PERCENT"}
          className="tabular-nums"
        />
      </Group>

      <TextInput
        label={t("discount.reason")}
        placeholder={t("discount.reasonPlaceholder")}
        value={value.reason}
        onChange={(e) => onChange({ ...value, reason: e.currentTarget.value })}
        required={touched}
      />

      {/* AC-2 — the money, recomputed as they type. `tabular-nums` so the digits don't dance. */}
      <Text fz="sm" className="tabular-nums">
        {t("discount.summaryFull", { full: formatPriceMinor(fullMinor) })}
        {" · "}
        {t("discount.summaryOff", { disc: formatPriceMinor(discountMinor) })}
        {" · "}
        <Text span fw={700}>
          {t("discount.summaryNet", { net: formatPriceMinor(netMinor) })}
        </Text>
      </Text>

      {/* Every problem at once — client-side and server-side alike. Staff fixing one and resubmitting straight
          into the next is the failure mode REQ-063 calls out by name. */}
      {(problemKeys.length > 0 || serverProblems.length > 0) && (
        <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
          <Stack gap={2}>
            {problemKeys.map((k) => (
              <Text key={k} fz="sm">
                {t(k)}
              </Text>
            ))}
            {serverProblems.map((p, i) => (
              <Text key={`s-${i}`} fz="sm">
                {p}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
