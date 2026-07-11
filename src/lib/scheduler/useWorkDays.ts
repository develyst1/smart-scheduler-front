"use client";

import { useI18n } from "@/lib/i18n";
import { formatWorkDaysLabel, workDayOptions } from "./work-days";

/** Language-aware working-day labels for the Teachers screen. */
export function useWorkDays() {
  const { lang, t } = useI18n();
  const format = (workDays?: readonly number[]) =>
    formatWorkDaysLabel(workDays, lang, {
      allDays: t("workdays.allDays"),
      weekdays: t("workdays.weekdays"),
      weekend: t("workdays.weekend"),
    });
  return { lang, options: workDayOptions(lang), format };
}
