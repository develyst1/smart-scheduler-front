"use client";

import { Select, type SelectProps } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { PAYMENT_METHODS, type PaymentMethod } from "@/types/payments";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}

/** The three methods in the active language, no empty choice (a payment always has a method). */
export default function PaymentMethodSelect({ value, onChange, label, ...rest }: Props) {
  const t = useT();
  return (
    <Select
      label={label ?? t("paymentRecord.method")}
      data={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`paymentRecord.methods.${m}`) }))}
      value={value}
      onChange={(v) => v && onChange(v as PaymentMethod)}
      allowDeselect={false}
      {...rest}
    />
  );
}
