"use client";

import { Badge, Button, Card, Group } from "@mantine/core";
import { RotateCcw } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { useArchivedTeachers, useReactivateTeacher } from "@/hooks/scheduler";
import { syncErrorMessage } from "@/lib/scheduler/teacher-errors";
import { TEACHER_TYPE_LABEL, type Teacher } from "@/types/app/scheduler";

export default function ArchivedTeachers() {
  const t = useT();
  const { data: archived = [] } = useArchivedTeachers();
  const reactivate = useReactivateTeacher();

  // Nothing archived → don't clutter the screen.
  if (archived.length === 0) return null;

  const onReactivate = async (teacher: Teacher) => {
    try {
      await reactivate.mutateAsync(teacher.id);
      notify({ title: t("teachers.reactivatedOk"), description: teacher.nickname, color: "success" });
    } catch (e) {
      notify({ title: "ผิดพลาด", description: syncErrorMessage(e, t), color: "danger" });
    }
  };

  return (
    <Card padding="md">
      <p className="mb-3 text-sm font-semibold text-muted-500">
        {t("teachers.archivedSection")} ({archived.length})
      </p>
      <div className="flex flex-col gap-2">
        {archived.map((tc) => (
          <div
            key={tc.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-muted-100 p-3 opacity-80"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {tc.name} <span className="text-xs text-muted-400">({tc.nickname})</span>
              </p>
              <Badge size="xs" variant="light" color="gray" mt={2}>
                {TEACHER_TYPE_LABEL[tc.type]}
              </Badge>
            </div>
            <Button
              size="xs"
              variant="light"
              color="green"
              leftSection={<RotateCcw size={13} />}
              onClick={() => onReactivate(tc)}
              loading={reactivate.isPending && reactivate.variables === tc.id}
            >
              {t("teachers.actReactivate")}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
