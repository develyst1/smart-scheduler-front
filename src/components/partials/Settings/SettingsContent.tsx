"use client";

import { useState } from "react";
import {
  Card,
  Stack,
  Group,
  Text,
  Badge,
  Button,
  NumberInput,
  Loader,
  Modal,
  Alert,
} from "@mantine/core";
import { Settings2, Pencil, RotateCcw, AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useSettings, useUpdateSetting, useResetSetting } from "@/hooks/scheduler";
import type { SettingRow } from "@/types/app/settings";

export default function SettingsContent() {
  const t = useT();
  const { data: rows = [], isLoading } = useSettings();
  const update = useUpdateSetting();
  const reset = useResetSetting();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<number>(0);
  const [editError, setEditError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<SettingRow | null>(null);

  const startEdit = (row: SettingRow) => {
    setEditingKey(row.key);
    setDraft(row.value);
    setEditError(null);
  };

  const save = async (row: SettingRow) => {
    setEditError(null);
    try {
      const res = await update.mutateAsync({ key: row.key, value: draft });
      setEditingKey(null);
      notify({
        title: t("settings.saved"),
        description: t("settings.savedDesc", { label: res.label, value: res.value, unit: res.unit }),
        color: "success",
      });
    } catch (e) {
      // A rejected value shows the server's reason — never silently accepted.
      setEditError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  const runReset = async () => {
    if (!resetTarget) return;
    const row = resetTarget;
    setResetTarget(null);
    try {
      const res = await reset.mutateAsync(row.key);
      if (editingKey === row.key) setEditingKey(null);
      notify({
        title: t("settings.resetDone"),
        description: t("settings.resetDoneDesc", { label: res.label, value: res.value, unit: res.unit }),
        color: "default",
      });
    } catch (e) {
      notify({
        title: t("settings.saveFailed"),
        description: e instanceof ApiClientError ? e.message : (e as Error).message,
        color: "danger",
      });
    }
  };

  return (
    <Stack gap="lg" className="max-w-3xl">
      <div>
        <Group gap="xs">
          <Settings2 size={22} />
          <Text fw={700} size="xl">
            {t("settings.title")}
          </Text>
        </Group>
        <Text size="sm" c="dimmed" mt={4}>
          {t("settings.subtitle")}
        </Text>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader size="sm" />
        </div>
      ) : rows.length === 0 ? (
        <Card padding="xl">
          <Text size="sm" c="dimmed" ta="center">
            {t("settings.empty")}
          </Text>
        </Card>
      ) : (
        <Stack gap="md">
          {rows.map((row) => {
            const editing = editingKey === row.key;
            return (
              <Card key={row.key} padding="lg" withBorder>
                <Stack gap="sm">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div>
                      <Text fw={600}>{row.label}</Text>
                      <Text size="sm" c="dimmed" mt={2}>
                        {t("settings.current")}: <strong>{row.value}</strong> {row.unit}
                        {" · "}
                        {t("settings.default")}: {row.default} {row.unit}
                      </Text>
                    </div>
                    <Badge
                      variant="light"
                      color={row.isOverridden ? "orange" : "gray"}
                    >
                      {row.isOverridden ? t("settings.overrideBadge") : t("settings.defaultBadge")}
                    </Badge>
                  </Group>

                  {editing ? (
                    <Stack gap="xs">
                      {editError && (
                        <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
                          {editError}
                        </Alert>
                      )}
                      <NumberInput
                        label={t("settings.valueLabel", { unit: row.unit })}
                        value={draft}
                        onChange={(v) => setDraft(typeof v === "number" ? v : 0)}
                        min={0}
                        step={1}
                        allowDecimal={false}
                        className="max-w-xs"
                      />
                      <Group gap="sm">
                        <Button
                          size="xs"
                          loading={update.isPending}
                          onClick={() => save(row)}
                        >
                          {t("settings.save")}
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          onClick={() => setEditingKey(null)}
                        >
                          {t("settings.cancel")}
                        </Button>
                      </Group>
                    </Stack>
                  ) : (
                    <Group gap="sm">
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<Pencil size={14} />}
                        onClick={() => startEdit(row)}
                      >
                        {t("settings.edit")}
                      </Button>
                      {row.isOverridden && (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          leftSection={<RotateCcw size={14} />}
                          loading={reset.isPending && reset.variables === row.key}
                          onClick={() => setResetTarget(row)}
                        >
                          {t("settings.reset")}
                        </Button>
                      )}
                    </Group>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}

      <Modal
        opened={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        centered
        title={t("settings.resetConfirmTitle")}
      >
        <Stack gap="lg">
          <Text size="sm">
            {resetTarget
              ? t("settings.resetConfirmMsg", {
                  label: resetTarget.label,
                  value: resetTarget.default,
                  unit: resetTarget.unit,
                })
              : null}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setResetTarget(null)}>
              {t("settings.cancel")}
            </Button>
            <Button color="gray" leftSection={<RotateCcw size={15} />} onClick={runReset}>
              {t("settings.reset")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
