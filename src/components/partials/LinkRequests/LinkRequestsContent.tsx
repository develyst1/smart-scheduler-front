"use client";

import { useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/th";
import { Card, Stack, Group, Text, Badge, Button, Select, Loader, Alert, Divider } from "@mantine/core";
import { Check, X, Link2Off, AlertTriangle, Inbox, Smartphone } from "lucide-react";
import {
  useTeacherLinkRequests,
  useApproveLinkRequest,
  useRejectLinkRequest,
  useUnlinkTeacherLine,
  useTeachers,
} from "@/hooks/scheduler";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { isCollision, type TeacherLinkRequest } from "@/types/app/teacher-link";
import type { TeacherView } from "@/types/app/scheduler";

/**
 * One pending request. A **collision** (the request names no teacher) renders the candidate picker inline and
 * keeps Approve disabled until staff name someone — the server refuses it too, but the UI must never present
 * approval as available when it cannot succeed.
 */
function RequestCard({
  request,
  onApprove,
  onReject,
  busy,
}: {
  request: TeacherLinkRequest;
  onApprove: (teacherId?: string) => void;
  onReject: () => void;
  busy: boolean;
}) {
  const { t, lang } = useI18n();
  const collision = isCollision(request);
  const [picked, setPicked] = useState<string | null>(null);

  const named = request.candidates.find((c) => c.id === request.teacherId);
  const arrived = dayjs(request.createdAt).locale(lang);
  const arrivedText =
    lang === "th"
      ? `${arrived.format("D MMM")} ${arrived.year() + 543} ${arrived.format("HH:mm")} น.`
      : arrived.format("D MMM YYYY, HH:mm");

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div className="min-w-0">
            <Group gap="xs">
              <Text fw={600}>{request.claimedNickname}</Text>
              {collision ? (
                <Badge color="orange" variant="light" leftSection={<AlertTriangle size={12} />}>
                  {t("linkRequests.collision")}
                </Badge>
              ) : (
                <Badge color="blue" variant="light">
                  {named?.name ?? t("linkRequests.namedTeacher")}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" mt={2}>
              {t("linkRequests.arrived", { time: arrivedText })} · {request.lineUserRef}
            </Text>
          </div>
        </Group>

        {/* The collision IS the feature — choosing is the primary action here, not a hidden extra step. */}
        {collision && (
          <Select
            label={t("linkRequests.whichTeacher")}
            description={t("linkRequests.whichTeacherHint")}
            placeholder={t("linkRequests.pickPlaceholder")}
            value={picked}
            onChange={setPicked}
            allowDeselect={false}
            data={request.candidates.map((c) => ({ value: c.id, label: `${c.name} (${c.nickname})` }))}
            comboboxProps={{ withinPortal: true }}
          />
        )}

        <Group gap="sm">
          <Button
            size="xs"
            leftSection={<Check size={15} />}
            loading={busy}
            disabled={collision && !picked}
            onClick={() => onApprove(collision ? picked! : undefined)}
          >
            {t("linkRequests.approve")}
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<X size={15} />}
            loading={busy}
            onClick={onReject}
          >
            {t("linkRequests.reject")}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export default function LinkRequestsContent() {
  const { t } = useI18n();
  const { data: requests = [], isLoading } = useTeacherLinkRequests("PENDING");
  const { data: teachers = [] } = useTeachers();
  const approve = useApproveLinkRequest();
  const reject = useRejectLinkRequest();
  const unlink = useUnlinkTeacherLine();

  const [unlinkTarget, setUnlinkTarget] = useState<TeacherView | null>(null);

  const linked = teachers.filter((tc) => tc.lineLinked);

  const fail = (e: unknown) =>
    notify({
      title: t("common.error"),
      description: e instanceof ApiClientError ? e.message : undefined,
      color: "danger",
    });

  const runApprove = async (r: TeacherLinkRequest, teacherId?: string) => {
    try {
      await approve.mutateAsync({ id: r.id, teacherId });
      notify({
        title: t("linkRequests.approvedTitle"),
        description: t("linkRequests.approvedDesc", { nickname: r.claimedNickname }),
        color: "success",
      });
    } catch (e) {
      fail(e);
    }
  };

  const runReject = async (r: TeacherLinkRequest) => {
    try {
      await reject.mutateAsync(r.id);
      notify({ title: t("linkRequests.rejectedTitle"), color: "default" });
    } catch (e) {
      fail(e);
    }
  };

  const runUnlink = async (teacher: TeacherView) => {
    setUnlinkTarget(null);
    try {
      await unlink.mutateAsync(teacher.id);
      notify({
        title: t("linkRequests.unlinkedTitle"),
        description: t("linkRequests.unlinkedDesc", { teacher: teacher.nickname }),
        color: "warning",
      });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <Stack gap="md">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("linkRequests.title")}</h1>
        <p className="max-w-2xl text-sm text-default-500">{t("linkRequests.subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-default-500">
          <Loader size="md" />
          {t("common.loading")}
        </div>
      ) : requests.length === 0 ? (
        <Card withBorder padding="lg">
          <Group justify="center" gap="xs" c="dimmed">
            <Inbox size={18} />
            <Text size="sm">{t("linkRequests.empty")}</Text>
          </Group>
        </Card>
      ) : (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t("linkRequests.pendingCount", { count: requests.length })}
          </Text>
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              busy={
                (approve.isPending && approve.variables?.id === r.id) ||
                (reject.isPending && reject.variables === r.id)
              }
              onApprove={(teacherId) => runApprove(r, teacherId)}
              onReject={() => runReject(r)}
            />
          ))}
        </Stack>
      )}

      <Divider my="xs" />

      {/* Unlink lives here rather than on the Teachers page: everything about a LINE link — granting it and
          removing it — is then in one place staff can find, and neither action is buried in a row menu. */}
      <div>
        <h2 className="text-base font-semibold">{t("linkRequests.linkedTitle")}</h2>
        <p className="max-w-2xl text-sm text-default-500">{t("linkRequests.linkedSubtitle")}</p>
      </div>

      {linked.length === 0 ? (
        <Card withBorder padding="lg">
          <Group justify="center" gap="xs" c="dimmed">
            <Smartphone size={18} />
            <Text size="sm">{t("linkRequests.noneLinked")}</Text>
          </Group>
        </Card>
      ) : (
        <Card withBorder padding={0}>
          <Stack gap={0}>
            {linked.map((tc, i) => (
              <Group
                key={tc.id}
                justify="space-between"
                wrap="nowrap"
                p="sm"
                className={i > 0 ? "border-t border-default-200" : undefined}
              >
                <div className="min-w-0">
                  <Text fw={500}>{tc.nickname}</Text>
                  <Text size="xs" c="dimmed">
                    {tc.name}
                  </Text>
                </div>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  leftSection={<Link2Off size={15} />}
                  loading={unlink.isPending && unlink.variables === tc.id}
                  onClick={() => setUnlinkTarget(tc)}
                >
                  {t("linkRequests.unlink")}
                </Button>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      {/* Unlink is destructive-ish (the teacher stops receiving schedule pushes) → confirm, don't just do it. */}
      {unlinkTarget && (
        <Alert color="orange" variant="light" icon={<AlertTriangle size={18} />}>
          <Stack gap="sm">
            <Text size="sm">
              {t("linkRequests.unlinkConfirm", { teacher: unlinkTarget.name })}
            </Text>
            <Group gap="sm">
              <Button size="xs" color="red" onClick={() => runUnlink(unlinkTarget)}>
                {t("linkRequests.unlink")}
              </Button>
              <Button size="xs" variant="default" onClick={() => setUnlinkTarget(null)}>
                {t("common.cancel")}
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
