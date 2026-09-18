"use client";

import dayjs from "dayjs";
import { Text } from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useT } from "@/lib/i18n";

/**
 * REQ-095 (TASK-395 / TASK-398) — the multi-date picker the OTHER series and the DUO/Group series SHARE: a calendar
 * with ticks and the tick count. Dates as `YYYY-MM-DD`; the dialogs sort them for the wire. 🚫 No rule here: the count
 * is shown, not judged (the server's 1–60 is the server's).
 */
export default function MultiDateField({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const t = useT();
  return (
    <div>
      <Text size="sm" fw={500}>
        {t("booking.otherSeriesDates")}
      </Text>
      <Text size="xs" c="dimmed" mb={4}>
        {t("booking.otherSeriesCount", { n: String(value.length) })}
      </Text>
      <DatePicker
        type="multiple"
        value={value.map((d) => new Date(d))}
        onChange={(v) => onChange((v as unknown as (Date | string)[]).map((d) => dayjs(d).format("YYYY-MM-DD")))}
        numberOfColumns={2}
      />
    </div>
  );
}
