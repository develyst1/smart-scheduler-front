"use client";

import { useEffect, useState } from "react";
import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { useCreateParent, useUpdateParent } from "@/hooks/scheduler";
import { ApiClientError } from "@/lib/api/client";
import { TH_PROVINCES } from "@/lib/people/th-provinces";
import type { Parent } from "@/types/app/people";

interface Props {
  opened: boolean;
  /** null = add mode; a parent = edit mode. */
  parent: Parent | null;
  onClose: () => void;
}

export default function ParentFormModal({ opened, parent, onClose }: Props) {
  const t = useT();
  const create = useCreateParent();
  const update = useUpdateParent();
  const isEdit = !!parent;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!opened) return;
    setName(parent?.name ?? "");
    setPhone(parent?.phone ?? "");
    setProvince(parent?.province ?? null);
    setNote(parent?.note ?? "");
  }, [opened, parent]);

  const busy = create.isPending || update.isPending;

  const submit = async () => {
    if (!phone.trim()) {
      notify({ title: t("people.phoneRequired"), color: "warning" });
      return;
    }
    try {
      const input = {
        name: name.trim() || null,
        phone: phone.trim(),
        province: province ?? null,
        note: note.trim() || null,
      };
      if (isEdit && parent) {
        await update.mutateAsync({ id: parent.id, input });
      } else {
        await create.mutateAsync(input);
      }
      notify({ title: t("people.parentSaved"), description: name || phone, color: "success" });
      onClose();
    } catch (e) {
      notify({
        title: t("common.error"),
        description: e instanceof ApiClientError ? e.message : undefined,
        color: "danger",
      });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? t("people.editParentTitle") : t("people.addParentTitle")}
      centered
      radius="lg"
      size="lg"
    >
      <Stack gap="md">
        <Group grow>
          <TextInput
            label={t("people.parentName")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <TextInput
            label={t("people.phone")}
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            required
            inputMode="tel"
          />
        </Group>

        <Select
          label={t("people.province")}
          placeholder={t("people.provincePlaceholder")}
          data={TH_PROVINCES}
          value={province}
          onChange={setProvince}
          searchable
          clearable
          maxDropdownHeight={280}
        />

        {/* TASK-069 — `parents.note` existed in the schema but had no way in until TASK-050 opened it. */}
        <Textarea
          label={t("people.parentNote")}
          placeholder={t("people.parentNotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={5}
          maxLength={500}
        />

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="green" onClick={submit} loading={busy}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
