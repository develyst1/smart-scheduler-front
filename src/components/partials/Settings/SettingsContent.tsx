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
  Input,
  SegmentedControl,
  Loader,
  Modal,
  Alert,
} from "@mantine/core";
import { Settings2, Pencil, RotateCcw, AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useSettings, useUpdateSetting, useResetSetting } from "@/hooks/scheduler";
import { settingHelp } from "@/lib/scheduler/setting-help";
import type { SettingRow } from "@/types/app/settings";

export default function SettingsContent() {
  const t = useT();
  const { data: rows = [], isLoading } = useSettings();
  const update = useUpdateSetting();
  const reset = useResetSetting();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | string>(0);
  const [editError, setEditError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<SettingRow | null>(null);

  const startEdit = (row: SettingRow) => {
    setEditingKey(row.key);
    setDraft(row.value);
    setEditError(null);
  };

  /** SPEC-044 — an enum value travels as its raw key (`admin_only`); staff must never see that key. Its words live in
   *  `dictionaries.ts` under `settings.opt.<key>`, so both languages come from one place. A key with no dictionary
   *  entry falls back to itself rather than rendering blank — visible, not silently empty. */
  const optionLabel = (row: SettingRow, value: string) => {
    const label = t(`settings.opt.${row.key}.${value}`);
    return label === `settings.opt.${row.key}.${value}` ? value : label;
  };

  /** What the row currently reads as: an enum's words, or the number itself. */
  const displayValue = (row: SettingRow, value: number | string) =>
    row.type === "enum" ? optionLabel(row, String(value)) : String(value);

  const save = async (row: SettingRow) => {
    setEditError(null);
    try {
      const res = await update.mutateAsync({ key: row.key, value: draft });
      setEditingKey(null);
      notify({
        title: t("settings.saved"),
        // An enum must read as its words here too — a toast saying "admin_only" leaks the storage key.
        description: t("settings.savedDesc", {
          label: res.label,
          value: displayValue(res, res.value),
          unit: res.type === "enum" ? "" : res.unit,
        }),
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
        description: t("settings.resetDoneDesc", {
          label: res.label,
          value: displayValue(res, res.value),
          unit: res.type === "enum" ? "" : res.unit,
        }),
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
            // `row.value` is the EFFECTIVE value — the override if one is set, else the coded default — so the
            // help sentence reads back what staff actually configured.
            const helpText = settingHelp(t, row.key, row.value);
            return (
              <Card key={row.key} padding="lg" withBorder>
                <Stack gap="sm">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div>
                      <Text fw={600}>{row.label}</Text>
                      <Text size="sm" c="dimmed" mt={2}>
                        {t("settings.current")}: <strong>{displayValue(row, row.value)}</strong>
                        {/* An enum's words already say what it is — "Admin only option" would just be noise. */}
                        {row.type === "enum" ? "" : ` ${row.unit}`}
                        {" · "}
                        {t("settings.default")}: {displayValue(row, row.default)}
                        {row.type === "enum" ? "" : ` ${row.unit}`}
                      </Text>
                      {/* SPEC-048 / TASK-147 (Sober authorised 2026-09-01) — help is no longer gated on
                          `row.type === "enum"`. That gate meant the two leave-cut-off rules (`type:"number"`)
                          could carry help text in `dictionaries.ts` that NEVER reached a human: true of the
                          file, false of the screen.

                          🔴 What makes widening this safe is the dictionary-miss check inside `settingHelp` —
                          a row with no `settings.help.<key>` entry still renders NOTHING, so no other row's
                          appearance changed. That check is a named, tested function precisely because the whole
                          safety of this line rests on it (`lib/scheduler/setting-help.test.ts`).

                          🔴 And it passes `{n}` — the row's EFFECTIVE value, so the sentence tracks what staff
                          just saved (REQ-047 AC-7: never a hardcoded "3"). Rendering it without vars would
                          print a literal `{n}` on screen, which reads as a broken product rather than as
                          missing copy — worse than shipping no help line at all. */}
                      {helpText && (
                        <Text size="xs" c="dimmed" mt={4}>
                          {helpText}
                        </Text>
                      )}
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
                      {row.type === "enum" ? (
                        // A named choice, never a 0|1 standing in for a decision (SPEC-044). Two options → segmented,
                        // so both are visible at once and picking one is a single tap.
                        <Input.Wrapper label={t("settings.choiceLabel")}>
                          <SegmentedControl
                            fullWidth
                            value={String(draft)}
                            onChange={setDraft}
                            data={(row.options ?? []).map((o) => ({
                              value: o,
                              label: optionLabel(row, o),
                            }))}
                            mt={4}
                          />
                        </Input.Wrapper>
                      ) : (
                        <NumberInput
                          label={t("settings.valueLabel", { unit: row.unit })}
                          value={typeof draft === "number" ? draft : 0}
                          onChange={(v) => setDraft(typeof v === "number" ? v : 0)}
                          min={0}
                          step={1}
                          allowDecimal={false}
                          className="max-w-xs"
                        />
                      )}
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
                  value: displayValue(resetTarget, resetTarget.default),
                  unit: resetTarget.type === "enum" ? "" : resetTarget.unit,
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
