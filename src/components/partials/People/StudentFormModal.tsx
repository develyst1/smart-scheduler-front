"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Button, Group, Modal, Select, Stack, TextInput, SegmentedControl, Text, Alert } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { useCreateStudent, useUpdateStudent } from "@/hooks/scheduler";
import { ApiClientError } from "@/lib/api/client";
import { GENDERS, THAI_NATIONALITY, type Student } from "@/types/app/people";

interface Props {
  opened: boolean;
  parentId: string;
  /** null = add mode; a student = edit mode. */
  student: Student | null;
  onClose: () => void;
}

type NatMode = "none" | "thai" | "foreign";

const ageOf = (birthDate: string | null): number | null => {
  if (!birthDate) return null;
  const d = dayjs(birthDate);
  if (!d.isValid()) return null;
  const age = dayjs().diff(d, "year");
  return age >= 0 && age < 130 ? age : null;
};

export default function StudentFormModal({ opened, parentId, student, onClose }: Props) {
  const t = useT();
  const create = useCreateStudent();
  const update = useUpdateStudent();
  const isEdit = !!student;

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [natMode, setNatMode] = useState<NatMode>("none");
  const [country, setCountry] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!opened) return;
    setName(student?.name ?? "");
    setNickname(student?.nickname ?? "");
    setGender(student?.gender ?? null);
    setBirthDate(student?.birthDate ?? null);
    setNote(student?.note ?? "");
    const nat = student?.nationality ?? null;
    if (nat == null) {
      setNatMode("none");
      setCountry("");
    } else if (nat === THAI_NATIONALITY) {
      setNatMode("thai");
      setCountry("");
    } else {
      setNatMode("foreign");
      setCountry(nat);
    }
  }, [opened, student]);

  const busy = create.isPending || update.isPending;
  const age = ageOf(birthDate);

  const GENDER_LABEL: Record<string, string> = {
    male: t("people.genderMale"),
    female: t("people.genderFemale"),
    other: t("people.genderOther"),
  };

  const nationalityValue = (): string | null => {
    if (natMode === "thai") return THAI_NATIONALITY;
    if (natMode === "foreign") return country.trim() || null;
    return null;
  };

  const submit = async () => {
    if (!name.trim()) {
      notify({ title: t("people.studentNameRequired"), color: "warning" });
      return;
    }
    const demo = {
      gender: gender ?? null,
      birthDate: birthDate ?? null,
      nationality: nationalityValue(),
    };
    try {
      if (isEdit && student) {
        await update.mutateAsync({
          id: student.id,
          input: { name: name.trim(), nickname: nickname.trim() || null, note: note.trim() || null, ...demo },
        });
      } else {
        await create.mutateAsync({
          parentId,
          input: { name: name.trim(), nickname: nickname.trim() || null, note: note.trim() || null, ...demo },
        });
      }
      notify({ title: t("people.studentSaved"), description: nickname || name, color: "success" });
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
      title={isEdit ? t("people.editStudentTitle") : t("people.addStudentTitle")}
      centered
      radius="lg"
      size="lg"
    >
      <Stack gap="md">
        <Group grow>
          <TextInput
            label={t("people.studentName")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
          />
          <TextInput
            label={t("people.nickname")}
            value={nickname}
            onChange={(e) => setNickname(e.currentTarget.value)}
          />
        </Group>

        <Group grow align="flex-start">
          <Select
            label={t("people.gender")}
            data={GENDERS.map((g) => ({ value: g, label: GENDER_LABEL[g] }))}
            value={gender}
            onChange={setGender}
            clearable
          />
          <div>
            <DatePickerInput
              label={t("people.birthDate")}
              value={birthDate}
              onChange={setBirthDate}
              valueFormat="D MMM YYYY"
              clearable
              maxDate={dayjs().format("YYYY-MM-DD")}
              popoverProps={{ withinPortal: true }}
            />
            {age != null && (
              <Text size="xs" c="dimmed" mt={4}>
                {t("people.age", { n: age })}
              </Text>
            )}
          </div>
        </Group>

        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("people.nationality")}
          </Text>
          <Group align="flex-start" gap="sm">
            <SegmentedControl
              value={natMode}
              onChange={(v) => setNatMode(v as NatMode)}
              data={[
                { value: "none", label: t("common.none") },
                { value: "thai", label: t("people.natThai") },
                { value: "foreign", label: t("people.natForeign") },
              ]}
            />
            {natMode === "foreign" && (
              <TextInput
                placeholder={t("people.country")}
                aria-label={t("people.country")}
                value={country}
                onChange={(e) => setCountry(e.currentTarget.value)}
                className="flex-1"
              />
            )}
          </Group>
        </div>

        <TextInput
          label={t("people.note")}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />

        <Alert variant="light" color="blue">
          <Text fz="sm">{t("people.demoOptional")}</Text>
        </Alert>

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
