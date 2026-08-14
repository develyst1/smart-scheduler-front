"use client";

import dayjs from "dayjs";
import "dayjs/locale/th";
import Link from "next/link";
import { Card, Stack, Text, Badge, Alert, Loader, Group, Anchor } from "@mantine/core";
import { AlertTriangle, CircleCheck, Clock } from "lucide-react";
import { useAttention } from "@/hooks/scheduler";
import { useI18n } from "@/lib/i18n";
import type { AttentionCheck } from "@/types/app/attention";

/** Checks whose work is cleared on a specific screen. Keyed by the API's check key. */
const CHECK_LINKS: Record<string, string> = {
  pending_teacher_links: "/scheduler/link-requests",
};

export default function AttentionContent() {
  const { t, lang } = useI18n();
  const { data, isLoading } = useAttention();

  const resolveTitle = (c: AttentionCheck) => {
    const key = `attention.checks.${c.key}`;
    const label = t(key);
    return label === key ? c.title : label; // fall back to the API's TH default if the FE has no label yet
  };

  const fmtTime = (iso: string) => {
    const d = dayjs(iso).locale(lang);
    return lang === "th"
      ? `${d.format("D MMM")} ${d.year() + 543} ${d.format("HH:mm")} น.`
      : d.format("D MMM YYYY, HH:mm");
  };

  if (isLoading) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted-500">
        <Loader size="md" />
        {t("common.loading")}
      </div>
    );
  }

  const checks = data?.checks ?? [];
  const lastRun = data?.lastRun ?? null;
  const outstanding = checks.filter((c) => c.count !== null && c.count > 0);
  const degraded = checks.filter((c) => c.count === null);
  const clear = checks.filter((c) => c.count === 0);
  const allQuiet = outstanding.length === 0 && degraded.length === 0;

  return (
    <Stack gap="md">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("attention.title")}</h1>
        <p className="max-w-2xl text-sm text-muted-500">{t("attention.subtitle")}</p>
      </div>

      {/* Last-run indicator — a never-run digest is a silent failure, so this is loud, not a footer. */}
      {lastRun === null ? (
        <Alert color="red" icon={<AlertTriangle size={18} />} variant="light">
          <Text fw={500}>{t("attention.neverRun")}</Text>
        </Alert>
      ) : (
        <Group gap="xs" c="dimmed">
          <Clock size={14} />
          <Text size="sm">
            {lastRun.sent
              ? t("attention.lastSent", { time: fmtTime(lastRun.finishedAt) })
              : t("attention.ranNothing", { time: fmtTime(lastRun.finishedAt) })}
          </Text>
        </Group>
      )}

      {allQuiet && (
        <Card withBorder padding="lg">
          <Group gap="xs" justify="center" c="dimmed">
            <CircleCheck size={18} className="text-success" />
            <Text size="sm">{t("attention.nothingOutstanding")}</Text>
          </Group>
        </Card>
      )}

      {/* Outstanding checks — the real work, first. */}
      {outstanding.map((c) => (
        <Card key={c.key} withBorder padding="md">
          <Group justify="space-between" wrap="nowrap">
            <Text fw={600}>{resolveTitle(c)}</Text>
            <Group gap="sm" wrap="nowrap">
              {/* Counts-only checks have nowhere to click; send staff to the screen that clears them.
                  A link, not a second counter — the badge above is the one source of the number. */}
              {CHECK_LINKS[c.key] && (
                <Anchor component={Link} href={CHECK_LINKS[c.key]} size="sm">
                  {t("attention.open")}
                </Anchor>
              )}
              <Badge color="red" variant="light" size="lg">
                {c.count}
              </Badge>
            </Group>
          </Group>
          {c.items.length > 0 && (
            <Stack gap={4} mt="sm">
              {c.items.map((it) => (
                <div key={it.id} className="text-sm">
                  {it.label}
                  {it.hint && <span className="ml-1.5 text-xs text-muted-400">· {it.hint}</span>}
                </div>
              ))}
            </Stack>
          )}
        </Card>
      ))}

      {/* Degraded checks — "couldn't be checked" must never look like "nothing to do". */}
      {degraded.map((c) => (
        <Card key={c.key} withBorder padding="md" className="border-warning/40">
          <Group justify="space-between" wrap="nowrap">
            <Text fw={600}>{resolveTitle(c)}</Text>
            <Badge color="orange" variant="light" leftSection={<AlertTriangle size={12} />}>
              {t("attention.couldntCheck")}
            </Badge>
          </Group>
        </Card>
      ))}

      {/* All-clear checks — kept quiet so they don't crowd out real items. */}
      {clear.length > 0 && (
        <Card withBorder padding="sm">
          <Stack gap={6}>
            {clear.map((c) => (
              <Group key={c.key} gap="xs">
                <CircleCheck size={14} className="text-success" />
                <Text size="sm" c="dimmed">
                  {resolveTitle(c)}
                </Text>
                <Text size="xs" c="dimmed">
                  · {t("attention.allClear")}
                </Text>
              </Group>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
