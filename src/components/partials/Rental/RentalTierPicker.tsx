"use client";

import { Select, Stack, TextInput } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { useSellablePackages } from "@/hooks/scheduler";
import { RENTAL_CODES } from "@/types/app/scheduler";

/**
 * REQ-091 (TASK-372 → TASK-374) — **the ONE rental tier picker**: the five codes in the customer's price ladder, each
 * labelled `{tier} — {price}` with the customer's tier WORDS and the server's price (`rentalItems`, the same source
 * `RentalModal` reads — never a second FE copy), plus the remark field. Used by the per-session `RentalSection` on the
 * booking modal and by the whole-course picker on course creation. 🚫 It decides nothing: whether a tier REQUIRES a
 * remark (set + ride) is the server's rule, refused as `RENTAL_REMARK_REQUIRED` and shown as its sentence.
 */
export function useRentalPrices() {
  const { data: card } = useSellablePackages();
  return (code: string): number | undefined => card?.rentalItems.find((r) => r.code === code)?.priceMinor;
}

/** The customer's print shape: `Rent 200 / Full Set (inline skate size 18-19 CM)`. Baht from the server's satang. */
export const rentalPrintLine = (
  t: (key: string, vars?: Record<string, string | number>) => string,
  code: string,
  remark: string | null,
  priceMinor: number | undefined,
) => {
  const tier = t(`rental.tier.${code}`);
  const price = priceMinor == null ? "—" : String(Math.round(priceMinor / 100));
  const line = t("rental.printLine", { price, tier });
  return remark ? `${line} (${remark})` : line;
};

export default function RentalTierPicker({
  code,
  remark,
  onCode,
  onRemark,
  disabled = false,
}: {
  code: string | null;
  remark: string;
  onCode: (code: string | null) => void;
  onRemark: (remark: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const priceOf = useRentalPrices();
  return (
    <Stack gap="xs">
      <Select
        label={t("rental.item")}
        placeholder={t("rental.pickItem")}
        value={code}
        onChange={onCode}
        data={RENTAL_CODES.map((c) => {
          const p = priceOf(c);
          return {
            value: c,
            label: t("rental.tierLabel", { tier: t(`rental.tier.${c}`), price: p == null ? "—" : Math.round(p / 100) }),
          };
        })}
        allowDeselect={false}
        disabled={disabled}
        comboboxProps={{ withinPortal: true }}
      />
      <TextInput
        label={t("rental.remark")}
        description={t("rental.remarkHint")}
        value={remark}
        onChange={(e) => onRemark(e.currentTarget.value)}
        maxLength={200}
        disabled={disabled}
      />
    </Stack>
  );
}
