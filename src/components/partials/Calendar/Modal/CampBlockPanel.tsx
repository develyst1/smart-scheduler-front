"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Group, Loader, Modal, Select, Stack, Text } from "@mantine/core";
import { AlertTriangle, ArrowLeftRight, Tent } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";
import { useCan } from "@/hooks/scheduler/useMe";
import { useCampWeekDays, useUpdateCampWeekDay } from "@/hooks/scheduler/useCamp";
import { replaceTeacher, type CampBlock } from "@/lib/camp/grid";
import { isUuid } from "@/lib/camp/units";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import type { TeacherView } from "@/types/app/scheduler";

/**
 * REQ-095 §11 (TASK-419) — the camp PANEL a grid block opens (NOT the booking modal: a CAMP row is owned by its week,
 * every booking write on it is the server's `409 CAMP_ROW_OWNED`). The window, the day's teachers (from the roster's
 * day object — `GET /camp/weeks/:id/days`), a `Swap teacher` door by `camp.week-open` (hidden, not disabled) ⇒ ONE
 * `PATCH /camp/weeks/:id/days/:date { teacherIds }` with this column's teacher replaced; the `409 SLOT_TAKEN`
 * sentence names date · hour · teacher and nothing moved. A link to the week's roster.
 */
export default function CampBlockPanel({ block, teachers, onClose }: { block: CampBlock; teachers: TeacherView[]; onClose: () => void }) {
  const t = useT();
  const can = useCan();
  const { data, isLoading } = useCampWeekDays(block.campWeekId);
  const day = data?.days.find((d) => d.date === block.date);
  const swap = useUpdateCampWeekDay();
  const [swapOpen, setSwapOpen] = useState(false);
  const [to, setTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => teachers.find((x) => x.id === id)?.nickname ?? id;
  const dayTeacherIds = day?.teacherIds ?? [block.teacherId];

  // TASK-450b — the same guard on the WRITE: a mutation has no `enabled`, so a block whose week id never arrived would
  // have sent `PATCH /camp/weeks/undefined/days/:date`. The door is absent instead (hidden, never disabled).
  const hasWeek = isUuid(block.campWeekId);
  const runSwap = async () => {
    if (!to || !hasWeek) return;
    setError(null);
    try {
      const r = await swap.mutateAsync({ weekId: block.campWeekId, date: block.date, body: { teacherIds: replaceTeacher(dayTeacherIds, block.teacherId, to) } });
      notify({ title: t("calendar.campSwappedOk", { from: name(block.teacherId), to: name(to), n: r.inserted }), color: "success" });
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      centered
      size="sm"
      title={
        <span className="flex items-center gap-2 font-semibold">
          <Tent size={16} className="text-teal-700" /> {block.title}
          <Badge size="xs" variant="light" color="teal">
            {t("calendar.otherKindTag_CAMP")}
          </Badge>
        </span>
      }
    >
      <Stack gap="sm" data-camp-panel={block.campWeekDayId}>
        <Text size="sm">
          {formatDateDisplay(block.date)} · {formatTimeDisplay(day?.startTime ?? block.startTime)}–{formatTimeDisplay(day?.endTime ?? block.endTime)}
        </Text>
        <div>
          <Text size="xs" c="dimmed">
            {t("calendar.campTeachersToday")}
          </Text>
          {isLoading && !day ? (
            <Loader size="xs" />
          ) : (
            <Text size="sm">{dayTeacherIds.map(name).join(" · ")}</Text>
          )}
        </div>
        {error && (
          <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
            {error}
          </Alert>
        )}
        {swapOpen && (
          <Group align="flex-end" gap="xs">
            <Select
              label={t("calendar.campSwapTo", { from: name(block.teacherId) })}
              data={teacherSelectData(teachers.filter((x) => x.bookable && x.id !== block.teacherId))}
              value={to}
              onChange={setTo}
              searchable
              renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
              className="grow"
            />
            <Button size="sm" loading={swap.isPending} disabled={!to} onClick={() => void runSwap()}>
              {t("calendar.campSwapConfirm")}
            </Button>
          </Group>
        )}
        <Group justify="space-between" gap="sm">
          <Button component={Link} href="/scheduler/camp" variant="subtle" size="xs">
            {t("calendar.campOpenRoster")}
          </Button>
          <Group gap="xs">
            <Button variant="default" size="xs" onClick={onClose}>
              {t("common.close")}
            </Button>
            {can("action:camp.week-open") && hasWeek && !swapOpen && (
              <Button size="xs" variant="light" leftSection={<ArrowLeftRight size={13} />} onClick={() => setSwapOpen(true)}>
                {t("calendar.campSwap")}
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
