"use client";

import { Modal, Stack, Group, Text, Badge, Loader, Timeline, Alert } from "@mantine/core";
import { Info } from "lucide-react";
import dayjs from "dayjs";
import { useCourseHistory } from "@/hooks/scheduler";
import { useT } from "@/lib/i18n";
import type { CourseHistoryEvent } from "@/types/app/scheduler";

/** Read-only deduction history for one course (SPEC-035 / TASK-120). Server builds the events; we only render. */
export default function CourseHistoryModal({
  courseId,
  onClose,
}: {
  courseId: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const { data, isLoading } = useCourseHistory(courseId, courseId !== null);

  // "attended" → "history.kindAttended", "no-show" → "history.kindNo-show", …
  const kindLabel = (kind: string) => {
    const key = `history.kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
    return t(key);
  };

  const eventColor = (kind: string) =>
    kind === "cancelled" || kind === "no-show" || kind === "freelance-drawn"
      ? "red"
      : kind === "attended" || kind === "makeup-appended" || kind === "extra-session-added"
        ? "green"
        : "blue";

  const subtitle = (e: CourseHistoryEvent) => {
    const parts: string[] = [];
    if (e.subject?.name) parts.push(e.subject.name);
    if (e.teacher?.nickname || e.teacher?.name) parts.push((e.teacher.nickname || e.teacher.name) as string);
    if (e.makeupOfDate) parts.push(t("history.makeupOf", { date: dayjs(e.makeupOfDate).format("D MMM YYYY") }));
    if (e.reason) parts.push(e.reason);
    return parts.join(" · ");
  };

  const events = data?.events ?? [];
  const s = data?.summary;

  return (
    <Modal opened={courseId !== null} onClose={onClose} centered size="lg" title={t("history.title")}>
      <Stack gap="md">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader size="sm" />
          </div>
        ) : (
          <>
            {s && (
              <Group gap="xs" wrap="wrap">
                <Badge variant="light" color="blue">
                  {t("history.sumUsed")}: {s.usedSessions} {t("history.ofSize", { size: s.size })}
                </Badge>
                <Badge variant="light" color="orange">
                  {t("history.sumLeave")}: {s.leaveUsed}
                </Badge>
                <Badge variant="light" color="green">
                  {t("history.sumRemaining")}: {s.remaining}
                </Badge>
                {s.liveEndDate && (
                  <Badge variant="light" color="gray">
                    {t("history.sumEnd")}: {dayjs(s.liveEndDate).format("D MMM YYYY")}
                  </Badge>
                )}
              </Group>
            )}

            {events.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="lg">
                {t("history.empty")}
              </Text>
            ) : (
              <Timeline active={events.length} bulletSize={14} lineWidth={2}>
                {events.map((e, i) => (
                  <Timeline.Item
                    key={i}
                    color={eventColor(e.kind)}
                    title={
                      <Group gap="xs">
                        <Text size="sm" fw={600}>
                          {kindLabel(e.kind)}
                        </Text>
                        {e.sessionDate && (
                          <Text size="xs" c="dimmed">
                            {dayjs(e.sessionDate).format("D MMM YYYY")}
                          </Text>
                        )}
                      </Group>
                    }
                  >
                    {subtitle(e) && (
                      <Text size="xs" c="dimmed">
                        {subtitle(e)}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed" mt={2}>
                      {dayjs(e.at).format("D MMM YYYY HH:mm")}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}

            <Alert variant="light" color="gray" icon={<Info size={15} />}>
              <Text size="xs">{t("history.actorNote")}</Text>
            </Alert>
          </>
        )}
      </Stack>
    </Modal>
  );
}
