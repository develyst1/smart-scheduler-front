"use client";

import {
  Card,
  Switch,
  Loader,
  Button,
  Group,
  Stack,
  Paper,
  Progress,
  Badge,
} from "@mantine/core";
import { PowerOff, Power, Wallet, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import { notify } from "@/lib/ui/notify";
import { useWorkDays } from "@/lib/scheduler/useWorkDays";
import { useT } from "@/lib/i18n";
import TeacherWorkDaysSelect from "./TeacherWorkDaysSelect";
import { MANTINE_COLOR } from "@/lib/ui/colors";
import {
  useTeachers,
  useToggleTeacher,
  useToggleTeacherType,
  useTeacherTypeOrder,
  useSetTeacherTypeOrder,
  useSetLimitOverride,
} from "@/hooks/scheduler";
import type { TeacherType, TeacherView } from "@/types/app/scheduler";
import { TEACHER_TYPE_LABEL } from "@/types/app/scheduler";

const thb = (n: number) => n.toLocaleString("th-TH");

export default function TeachersContent() {
  const t = useT();
  const { data: teachers = [], isLoading: loadingTeachers } = useTeachers();
  const { data: typeOrder = [], isLoading: loadingOrder } = useTeacherTypeOrder();
  const toggle = useToggleTeacher();
  const toggleType = useToggleTeacherType();
  const setOrder = useSetTeacherTypeOrder();

  if (loadingTeachers || loadingOrder) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-default-500">
        <Loader size="md" />
        {t("common.loading")}
      </div>
    );
  }

  const handleToggleType = (type: TeacherType, active: boolean) => {
    toggleType.mutate({ type, active });
    notify({
      title: active
        ? t("teachers.groupEnabledTitle", { type: TEACHER_TYPE_LABEL[type] })
        : t("teachers.groupDisabledTitle", { type: TEACHER_TYPE_LABEL[type] }),
      description: active ? undefined : t("teachers.groupDisabledDesc"),
      color: active ? "success" : "default",
    });
  };

  const onDragEnd = ({ source, destination }: DropResult) => {
    if (!destination || source.index === destination.index) return;
    const next = [...typeOrder];
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
    setOrder.mutate(next);
  };

  return (
    <div className="space-y-6">
      {/* ── ลำดับความสำคัญการจัดครู ── */}
      <Paper withBorder p="md" className="bg-content1">
        <p className="mb-1 text-sm font-semibold">{t("teachers.priorityTitle")}</p>
        <p className="mb-3 text-xs text-default-400">{t("teachers.priorityHint")}</p>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="teacher-type-order">
            {(dropProvided) => (
              <div
                {...dropProvided.droppableProps}
                ref={dropProvided.innerRef}
                className="flex flex-col gap-2"
              >
                {typeOrder.map((type, i) => (
                  <Draggable key={type} draggableId={type} index={i}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={`flex items-center justify-between rounded-xl border bg-content1 p-2.5 transition-colors ${
                          snapshot.isDragging
                            ? "border-primary/50 shadow-md"
                            : "border-default-100"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            {...dragProvided.dragHandleProps}
                            className="cursor-grab text-default-300 active:cursor-grabbing"
                            aria-label={t("teachers.dragReorder")}
                          >
                            <GripVertical size={18} />
                          </span>
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                            {i + 1}
                          </span>
                          <TeacherTypeChip type={type} size="md" />
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </Paper>

      <p className="text-sm text-default-500">{t("teachers.pageHint")}</p>

      {typeOrder.map((type) => {
        const group = teachers.filter((tc) => tc.type === type);
        if (group.length === 0) return null;
        const allActive = group.every((tc) => tc.active);

        return (
          <Card key={type} padding="md">
            <Group justify="space-between" mb="sm">
              <div className="flex items-center gap-2">
                <TeacherTypeChip type={type} size="md" />
                <span className="text-sm text-default-400">{t("teachers.count", { n: group.length })}</span>
              </div>
              <Button
                size="xs"
                variant="light"
                color={allActive ? "gray" : "green"}
                leftSection={allActive ? <PowerOff size={15} /> : <Power size={15} />}
                onClick={() => handleToggleType(type, !allActive)}
              >
                {allActive ? t("teachers.disableGroup") : t("teachers.enableGroup")}
              </Button>
            </Group>
            <Stack gap="xs">
              {group.map((tc) =>
                tc.type === "FREELANCE" ? (
                  <FreelanceRow key={tc.id} teacher={tc} onToggle={() => toggle.mutate({ id: tc.id, active: !tc.active })} />
                ) : (
                  <TeacherRow key={tc.id} teacher={tc} onToggle={() => toggle.mutate({ id: tc.id, active: !tc.active })} />
                ),
              )}
            </Stack>
          </Card>
        );
      })}
    </div>
  );
}

// ───────────── แถวครูทั่วไป ─────────────

function TeacherRow({ teacher, onToggle }: { teacher: TeacherView; onToggle: () => void }) {
  const t = useT();
  const { format } = useWorkDays();
  return (
    <div
      className={`rounded-xl border border-default-100 p-3 transition-colors hover:bg-default-100/60 ${
        teacher.active ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{teacher.name}</p>
          <p className="text-xs text-default-400">
            ({teacher.nickname}) · {format(teacher.workDays)}
            {teacher.subjects.length > 0
              ? ` · ${teacher.subjects.slice(0, 3).join(", ")}${teacher.subjects.length > 3 ? "…" : ""}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`text-xs ${teacher.active ? "text-success" : "text-default-400"}`}>
            {teacher.active ? t("teachers.active") : t("teachers.inactive")}
          </span>
          <Switch
            checked={teacher.active}
            onChange={onToggle}
            aria-label={t("teachers.toggleStatus", { name: teacher.name })}
          />
        </div>
      </div>
      <TeacherWorkDaysSelect teacherId={teacher.id} nickname={teacher.nickname} workDays={teacher.workDays} />
    </div>
  );
}

// ───────────── แถวครู Freelance (มี income + limit) ─────────────

function FreelanceRow({ teacher, onToggle }: { teacher: TeacherView; onToggle: () => void }) {
  const t = useT();
  const { format } = useWorkDays();
  const setOverride = useSetLimitOverride();

  // โควต้าชั่วโมงทำงานคงเหลือมาจาก back-office EXPENSE item (ตัดทีละชม.ตอนสอนจริง)
  const remaining = teacher.quotaRemaining ?? null;
  const impliedTotal = remaining != null ? teacher.monthlyHours + remaining : 0;
  const pct =
    impliedTotal > 0
      ? Math.min(100, (teacher.monthlyHours / impliedTotal) * 100)
      : teacher.overLimit
        ? 100
        : 0;
  const reached = !!teacher.overLimit;

  const barColor = teacher.overLimit
    ? MANTINE_COLOR.danger
    : remaining != null && remaining <= 5
      ? MANTINE_COLOR.warning
      : MANTINE_COLOR.success;

  const handleOverride = (on: boolean) => {
    setOverride.mutate({ id: teacher.id, override: on });
    notify({
      title: on ? t("teachers.overrideOnTitle") : t("teachers.overrideOffTitle"),
      description: on ? t("teachers.overrideOnDesc", { name: teacher.nickname }) : undefined,
      color: on ? "warning" : "default",
    });
  };

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        teacher.overLimit ? "border-danger/30 bg-danger/5" : "border-default-100 hover:bg-default-100/60"
      } ${!teacher.active && !teacher.overLimit ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{teacher.name}</p>
          <p className="text-xs text-default-400">
            ({teacher.nickname}) · {format(teacher.workDays)} · ฿{thb(teacher.hourlyRate ?? 0)}{t("teachers.perHour")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {teacher.overLimit ? (
            <Badge color="red" variant="light">
              {t("teachers.overCap")}
            </Badge>
          ) : (
            <span className={`text-xs ${teacher.active ? "text-success" : "text-default-400"}`}>
              {teacher.active ? t("teachers.active") : t("teachers.inactive")}
            </span>
          )}
          <Switch
            checked={teacher.active}
            onChange={onToggle}
            disabled={teacher.overLimit && !teacher.limitOverride}
            aria-label={t("teachers.toggleStatus", { name: teacher.name })}
          />
        </div>
      </div>

      {/* income vs limit (เพดานจาก back-office) */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-default-500">
          <span className="flex items-center gap-1">
            <Wallet size={13} /> {t("teachers.monthIncome")}
          </span>
          <span>
            ฿{thb(teacher.monthlyIncome)}{" "}
            · {t("teachers.hours", { n: teacher.monthlyHours })}
            {remaining != null && (
              <span className="text-default-400"> · เหลือโควต้า {remaining} ชม.</span>
            )}
          </span>
        </div>
        <Progress size="md" radius="xl" value={pct} color={barColor} />
      </div>

      {reached && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="text-xs text-default-500">{t("teachers.overrideLabel")}</span>
          <Switch
            checked={!!teacher.limitOverride}
            onChange={(e) => handleOverride(e.currentTarget.checked)}
            color="orange"
            aria-label={t("teachers.overrideAria")}
          />
        </div>
      )}

      <TeacherWorkDaysSelect teacherId={teacher.id} nickname={teacher.nickname} workDays={teacher.workDays} />
    </div>
  );
}
