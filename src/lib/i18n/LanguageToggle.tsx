"use client";

import { SegmentedControl } from "@mantine/core";
import { useI18n } from "./I18nProvider";
import type { Lang } from "./dictionaries";

/**
 * EN/TH switch. Compact in the admin header by default; `/register` renders it `size="md" fullWidth` at the head
 * of the page (TASK-350 — *"ทำปุ่มเด่นๆ"*). Either way it does ONE thing: `setLang`.
 */
export default function LanguageToggle({ size = "xs", fullWidth = false }: { size?: "xs" | "sm" | "md"; fullWidth?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <SegmentedControl
      size={size}
      fullWidth={fullWidth}
      radius="md"
      value={lang}
      onChange={(v) => setLang(v as Lang)}
      aria-label={t("lang.label")}
      data={[
        { value: "en", label: "EN" },
        { value: "th", label: "ไทย" },
      ]}
    />
  );
}
