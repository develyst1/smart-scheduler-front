"use client";

import { useEffect, useState } from "react";
import { Button, Group, Modal, MultiSelect, Select, Stack, TextInput } from "@mantine/core";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { useWorkDays } from "@/lib/scheduler/useWorkDays";
import { useCreateTeacher, useUpdateTeacher } from "@/hooks/scheduler";
import { ApiClientError } from "@/lib/api/client";
import { TEACHER_TYPE_LABEL, type Teacher, type TeacherType } from "@/types/app/scheduler";
import { syncErrorMessage } from "@/lib/scheduler/teacher-errors";

interface Props {
  opened: boolean;
  /** null = add mode; a teacher = edit mode (name/nickname/subjects only). */
  teacher: Teacher | null;
  subjectCatalog: { value: string; label: string }[];
  onClose: () => void;
}

export default function TeacherFormModal({ opened, teacher, subjectCatalog, onClose }: Props) {
  const t = useT();
  const { options: dayOptions } = useWorkDays();
  const create = useCreateTeacher();
  const update = useUpdateTeacher();
  const isEdit = !!teacher;

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [type, setType] = useState<TeacherType>("FREELANCE");
  const [workDays, setWorkDays] = useState<number[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);

  useEffect(() => {
    if (!opened) return;
    setName(teacher?.name ?? "");
    setNickname(teacher?.nickname ?? "");
    setType(teacher?.type ?? "FREELANCE");
    setWorkDays(teacher?.workDays ?? []);
    setSubjectIds(teacher?.subjectOptions?.map((s) => s.id) ?? []);
  }, [opened, teacher]);

  const busy = create.isPending || update.isPending;

  const toggleDay = (day: number) =>
    setWorkDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));

  const submit = async () => {
    if (!name.trim() || !nickname.trim()) {
      notify({ title: t("teachers.formName"), color: "warning" });
      return;
    }
    try {
      if (isEdit && teacher) {
        await update.mutateAsync({
          id: teacher.id,
          input: { name: name.trim(), nickname: nickname.trim(), subjectIds },
        });
        notify({ title: t("teachers.updatedOk"), description: nickname, color: "success" });
      } else {
        await create.mutateAsync({
          name: name.trim(),
          nickname: nickname.trim(),
          type,
          workDays: workDays.length ? workDays : undefined,
          subjectIds: subjectIds.length ? subjectIds : undefined,
        });
        notify({ title: t("teachers.createdOk"), description: nickname, color: "success" });
      }
      onClose();
    } catch (e) {
      notify({
        title: "ผิดพลาด",
        description: syncErrorMessage(e, t, e instanceof ApiClientError ? e.message : undefined),
        color: "danger",
      });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? t("teachers.formEditTitle") : t("teachers.formAddTitle")}
      centered
      radius="lg"
      size="lg"
    >
      <Stack gap="md">
        <Group grow>
          <TextInput label={t("teachers.formName")} value={name} onChange={(e) => setName(e.currentTarget.value)} required />
          <TextInput label={t("teachers.formNickname")} value={nickname} onChange={(e) => setNickname(e.currentTarget.value)} required />
        </Group>

        {!isEdit && (
          <>
            <Select
              label={t("teachers.formType")}
              value={type}
              onChange={(v) => setType((v as TeacherType) ?? "FREELANCE")}
              data={(Object.keys(TEACHER_TYPE_LABEL) as TeacherType[]).map((ty) => ({
                value: ty,
                label: TEACHER_TYPE_LABEL[ty],
              }))}
              allowDeselect={false}
            />
            <div>
              <p className="mb-1.5 text-xs text-muted-500">{t("teachers.workDaysLabel")}</p>
              <div className="flex gap-1.5">
                {dayOptions.map((opt) => {
                  const day = Number(opt.value);
                  const selected = workDays.includes(day);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={selected}
                      className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "border border-muted-200 text-muted-500 hover:bg-muted-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <MultiSelect
          label={t("teachers.formSubjects")}
          description={t("teachers.formSubjectsHint")}
          data={subjectCatalog}
          value={subjectIds}
          onChange={setSubjectIds}
          searchable
          clearable
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
