"use client";

import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Textarea, TextInput } from "@mantine/core";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { useCreateParent, useUpdateParent } from "@/hooks/scheduler";
import { ApiClientError } from "@/lib/api/client";
import AreaPicker, { areaState, NO_AREA, type AreaCodes } from "./AreaPicker";
import type { Parent } from "@/types/app/people";
import { useCan } from "@/hooks/scheduler/useMe";

interface Props {
  opened: boolean;
  /** null = add mode; a parent = edit mode. */
  parent: Parent | null;
  onClose: () => void;
  /**
   * 🔴 TASK-696 — called with the family the server just CREATED (add mode only), after the success notice and before `onClose`.
   * The link-a-parent dialog uses it to go straight to its confirm for that family. 🔑 **Optional, and the People page does not
   * pass it — its own "Add parent" flow is exactly as it was** (pinned). Never called on a refusal, and never in edit mode.
   */
  onCreated?: (parent: Parent) => void;
}

export default function ParentFormModal({ opened, parent, onClose, onCreated }: Props) {
  const t = useT();
  const can = useCan(); // REQ-092 Stage 3 — the submit is the act; hidden without its key
  const create = useCreateParent();
  const update = useUpdateParent();
  const isEdit = !!parent;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // 🔴 TASK-801 (REQ-118) — the address is the 3-level picker, held as CODES. `areaTouched` is what keeps an untouched form from rewriting an
  // address: a parent with only the old province TEXT has no codes, and saving without touching the picker must send NO address (sending
  // null ×3 would CLEAR it).
  const [area, setArea] = useState<AreaCodes>(NO_AREA);
  const [areaTouched, setAreaTouched] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!opened) return;
    setName(parent?.name ?? "");
    setPhone(parent?.phone ?? "");
    setArea({ province: parent?.provinceCode ?? null, district: parent?.districtCode ?? null, subdistrict: parent?.subdistrictCode ?? null });
    setAreaTouched(false);
    setNote(parent?.note ?? "");
  }, [opened, parent]);

  const busy = create.isPending || update.isPending;
  const areaKind = areaState(area);
  // all three, or none: a half triple cannot be saved (the server refuses it too — this stops it before the request)
  const halfAddress = areaTouched && areaKind === "half";

  const submit = async () => {
    if (!phone.trim()) {
      notify({ title: t("people.phoneRequired"), color: "warning" });
      return;
    }
    if (halfAddress) return;
    try {
      let created: Parent | undefined;
      const input = {
        name: name.trim() || null,
        phone: phone.trim(),
        // 🔴 TASK-801 — only when the admin CHANGED the address: the three codes (all three), or null ×3 to clear. `province` (the old text) is no
        // longer sent — the server derives it from the code.
        ...(areaTouched
          ? areaKind === "full"
            ? { provinceCode: area.province, districtCode: area.district, subdistrictCode: area.subdistrict }
            : { provinceCode: null, districtCode: null, subdistrictCode: null }
          : {}),
        note: note.trim() || null,
      };
      if (isEdit && parent) {
        await update.mutateAsync({ id: parent.id, input });
      } else {
        created = await create.mutateAsync(input);
      }
      notify({ title: t("people.parentSaved"), description: name || phone, color: "success" });
      if (created) onCreated?.(created);
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
          {/* The province and note fields already carried placeholders; these two did not, so half the form
              said what it wanted and half showed an empty box. The phone one doubles as the format hint — the
              field takes free text, so nothing else tells staff it is stored as bare digits. */}
          <TextInput
            label={t("people.parentName")}
            placeholder={t("people.parentNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <TextInput
            label={t("people.phone")}
            placeholder={t("people.phonePlaceholder")}
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            required
            inputMode="tel"
          />
        </Group>

        {/* 🔴 TASK-801 (REQ-118) — province → district → sub-district, as CODES. A legacy text-only province is shown as the placeholder (the
            owner's TASK-353 "the visible value is the warning" rule, kept) and is never a pick. */}
        <AreaPicker
          value={area}
          onChange={(next) => {
            setArea(next);
            setAreaTouched(true);
          }}
          legacyProvince={parent && !parent.provinceCode ? parent.province : null}
          half={halfAddress}
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
          {can(isEdit ? "action:people.parent-edit" : "action:people.parent-create") && (
            <Button color="green" onClick={submit} loading={busy} disabled={halfAddress}>
              {t("common.save")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
