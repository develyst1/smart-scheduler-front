"use client";

/**
 * TASK-538 (BE) → TASK-539 (FE) — **the LINE accounts with admin rights, and taking those rights away.**
 *
 * 🔴 Why now: the demo phone is linked as an admin, **admin notices name other families' children**, and pushes resume
 * on 1 Oct. Until TASK-538 there was no route to remove the role and until this panel there was no way to press it.
 *
 * 🔑 **Super admin only, and the panel is ABSENT for everyone else** — no disabled button, no "you cannot do this" card:
 * `requireSuperAdmin` guards the routes, and there is no action key to hold (TASK-538 added none on purpose — a key is
 * grantable, which would make this power delegable). So the gate here is `session.user.isSuperAdmin`, the same honest-UI
 * pattern as the Users page.
 * 🚫 **Nothing is invented on this screen.** A row we cannot name says so (`lineAdmins.unknownAccount`) instead of
 * showing a blank that reads as a name; the server's own "what we cannot know" sentences are rendered as sent; and the
 * dialog never says *deleted* — it names what the account keeps.
 * 🚫 **No optimistic removal.** The row leaves when the server says it has, so a refusal never looks like a success.
 */
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, Stack, Group, Text, Button, Modal, Alert, List } from "@mantine/core";
import { ShieldOff, ShieldAlert, Info } from "lucide-react";
import { useLineAdmins, useRemoveLineAdmin } from "@/hooks/scheduler/useUsers";
import { adminRowLabel, adminRows, afterRemovalKey, notKnownLines, type LineAdminRow } from "@/lib/scheduler/line-admins";
import { useI18n } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";

export default function LineAdminsPanel() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.isSuperAdmin === true;

  const { data } = useLineAdmins(isSuperAdmin);
  const remove = useRemoveLineAdmin();
  const [target, setTarget] = useState<LineAdminRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isSuperAdmin) return null;

  const rows = adminRows(data);
  const notKnown = notKnownLines(data);

  const label = (row: LineAdminRow) => {
    const l = adminRowLabel(row);
    return "name" in l ? l.name : t(l.key);
  };

  const confirm = async (row: LineAdminRow) => {
    setError(null);
    try {
      const res = await remove.mutateAsync({ ref: row.ref });
      setTarget(null);
      // 🔑 A menu LINE would not take is still a removal — say both, rather than a clean "done" that hides half of it.
      notify(
        res.menuSettled
          ? { title: t("lineAdmins.removed"), color: "success" }
          : { title: t("lineAdmins.removed"), description: t("lineAdmins.menuUnsettled"), color: "warning" },
      );
    } catch (e) {
      // The dialog STAYS open on a refusal, carrying the server's sentence: nothing was removed, so nothing may look removed.
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Stack gap="md" data-line-admins-panel>
      <div>
        <h2 className="text-base font-semibold">{t("lineAdmins.title")}</h2>
        <p className="max-w-2xl text-sm text-muted-500">{t("lineAdmins.hint")}</p>
      </div>

      {rows.length === 0 ? (
        <Card withBorder padding="lg">
          <Group justify="center" gap="xs" c="dimmed">
            <ShieldOff size={18} />
            <Text size="sm">{t("lineAdmins.empty")}</Text>
          </Group>
        </Card>
      ) : (
        <Card withBorder padding={0}>
          <Stack gap={0}>
            {rows.map((row, i) => (
              <Group
                key={row.ref}
                justify="space-between"
                wrap="nowrap"
                p="sm"
                className={i > 0 ? "border-t border-muted-200" : undefined}
              >
                <div className="min-w-0">
                  <Text fw={500}>{label(row)}</Text>
                  <Text size="xs" c="dimmed">
                    {t("lineAdmins.tail", { tail: row.idTail })}
                  </Text>
                  {row.alsoTeacher ? (
                    <Text size="xs" c="dimmed">
                      {t("lineAdmins.alsoTeacher", { name: row.alsoTeacher })}
                    </Text>
                  ) : null}
                  {row.alsoParent ? (
                    <Text size="xs" c="dimmed">
                      {t("lineAdmins.alsoParent", { name: row.alsoParent })}
                    </Text>
                  ) : null}
                </div>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  leftSection={<ShieldOff size={15} />}
                  data-line-admin-remove={row.ref}
                  onClick={() => {
                    setError(null);
                    setTarget(row);
                  }}
                >
                  {t("lineAdmins.removeBtn")}
                </Button>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      {/* Rendered as the server sent it. The absence of a display name and of a link date is a FACT about our data, and
          this page is where someone is deciding on those rows — so the limits are stated, not silently worked around. */}
      {notKnown.length > 0 && (
        <Alert color="gray" variant="light" icon={<Info size={18} />} title={t("lineAdmins.notKnownTitle")}>
          <List size="sm" spacing={4}>
            {notKnown.map((line) => (
              <List.Item key={line}>{line}</List.Item>
            ))}
          </List>
        </Alert>
      )}

      <Modal
        opened={target !== null}
        onClose={() => setTarget(null)}
        title={t("lineAdmins.removeTitle")}
        centered
        data-line-admin-dialog
      >
        {target && (
          <Stack gap="sm">
            <Group gap="xs" wrap="nowrap">
              <ShieldAlert size={18} />
              <Text fw={500}>
                {label(target)} · {t("lineAdmins.tail", { tail: target.idTail })}
              </Text>
            </Group>
            <Text size="sm">{t("lineAdmins.removeBody")}</Text>
            <Text size="sm">{t(afterRemovalKey(target.afterRemoval))}</Text>
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <Group gap="sm" justify="flex-end">
              <Button size="xs" variant="default" onClick={() => setTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                size="xs"
                color="red"
                loading={remove.isPending}
                data-line-admin-confirm
                onClick={() => void confirm(target)}
              >
                {t("lineAdmins.confirm")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
