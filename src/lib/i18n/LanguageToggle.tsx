"use client";

import { SegmentedControl } from "@mantine/core";
import { useI18n } from "./I18nProvider";
import type { Lang } from "./dictionaries";

/** Compact EN/TH switch for the header. */
export default function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <SegmentedControl
      size="xs"
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
