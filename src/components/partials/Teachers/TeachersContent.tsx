"use client";

import { useMemo, useState } from "react";
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
  Tooltip,
} from "@mantine/core";
import { PowerOff, Power, Wallet, GripVertical, UserPlus } from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import { notify } from "@/lib/ui/notify";
import { useWorkDays } from "@/lib/scheduler/useWorkDays";
import { useT } from "@/lib/i18n";
import TeacherWorkDaysSelect from "./TeacherWorkDaysSelect";
import TeacherRowActions from "./TeacherRowActions";
import TeacherFormModal from "./TeacherFormModal";
import ArchivedTeachers from "./ArchivedTeachers";
import FreelanceBudgetControls from "./FreelanceBudgetControls";
import { MANTINE_COLOR } from "@/lib/ui/colors";
import {
  useTeachers,
  useToggleTeacher,
  useToggleTeacherType,
  useTeacherTypeOrder,
  useSetTeacherTypeOrder,
  useSetLimitOverride,
} from "@/hooks/scheduler";
import type { Teacher, TeacherType, TeacherView } from "@/types/app/scheduler";
import { TEACHER_TYPE_LABEL } from "@/types/app/scheduler";

const thb = (n: number) => n.toLocaleString("th-TH");
/** satang → whole-baht string (freelance budgets are whole baht). */
const bahtOfSatang = (satang: number) => thb(Math.round(satang / 100));

export default function TeachersContent() {
  const t = useT();
  const { data: teachers = [], isLoading: loadingTeachers } = useTeachers();
  const { data: typeOrder = [], isLoading: loadingOrder } = useTeacherTypeOrder();
  const toggle = useToggleTeacher();
  const toggleType = useToggleTeacherType();
  const setOrder = useSetTeacherTypeOrder();

  const [formOpen, setFormOpen] = useState(false);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);

  // Subject picker options = the union of subjects already assigned across the roster
  // (no standalone subjects catalog exists on the FE — see TASK-017 Questions).
  const subjectCatalog = useMemo(() => {
    const map = new Map<string, string>();
    for (const tc of teachers) for (const s of tc.subjectOptions ?? []) map.set(s.id, s.name);
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [teachers]);

  const openAdd = () => {
    setEditTeacher(null);
    setFormOpen(true);
  };
  const openEdit = (tc: Teacher) => {
    setEditTeacher(tc);
    setFormOpen(true);
  };

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

      <Group justify="space-between" align="center">
        <p className="text-sm text-default-500">{t("teachers.pageHint")}</p>
        <Button leftSection={<UserPlus size={16} />} onClick={openAdd}>
          {t("teachers.addTeacher")}
        </Button>
      </Group>

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
                  <FreelanceRow
                    key={tc.id}
                    teacher={tc}
                    onToggle={() => toggle.mutate({ id: tc.id, active: !tc.active })}
                    onEdit={() => openEdit(tc)}
                  />
                ) : (
                  <TeacherRow
                    key={tc.id}
                    teacher={tc}
                    onToggle={() => toggle.mutate({ id: tc.id, active: !tc.active })}
                    onEdit={() => openEdit(tc)}
                  />
                ),
              )}
            </Stack>
          </Card>
        );
      })}

      <ArchivedTeachers />

      <TeacherFormModal
        opened={formOpen}
        teacher={editTeacher}
        subjectCatalog={subjectCatalog}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}

// ───────────── ป้ายวิชา (โชว์ 3 ตัวแรก, ที่เหลือยุบเป็น +N + hover ดูครบ) ─────────────

const SUBJECT_CHIP_LIMIT = 3;

function SubjectChips({ subjects }: { subjects: string[] }) {
  if (subjects.length === 0) return null;
  const shown = subjects.slice(0, SUBJECT_CHIP_LIMIT);
  const rest = subjects.slice(SUBJECT_CHIP_LIMIT);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {shown.map((s) => (
        <Badge key={s} color="gray" variant="light" size="sm" radius="sm" tt="none">
          {s}
        </Badge>
      ))}
      {rest.length > 0 && (
        <Tooltip label={rest.join(", ")} withArrow multiline maw={260}>
          <Badge color="gray" variant="outline" size="sm" radius="sm" className="cursor-default">
            +{rest.length}
          </Badge>
        </Tooltip>
      )}
    </div>
  );
}

// ───────────── แถวครูทั่วไป ─────────────

function TeacherRow({
  teacher,
  onToggle,
  onEdit,
}: {
  teacher: TeacherView;
  onToggle: () => void;
  onEdit: () => void;
}) {
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
          </p>
          <SubjectChips subjects={teacher.subjects} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {teacher.setupIncomplete ? (
            <Badge color="yellow" variant="light">
              {t("teachers.setupIncomplete")}
            </Badge>
          ) : (
            <span className={`text-xs ${teacher.active ? "text-success" : "text-default-400"}`}>
              {teacher.active ? t("teachers.active") : t("teachers.inactive")}
            </span>
          )}
          <Switch
            checked={teacher.active}
            onChange={onToggle}
            disabled={teacher.setupIncomplete}
            aria-label={t("teachers.toggleStatus", { name: teacher.name })}
          />
          <TeacherRowActions teacher={teacher} onEdit={onEdit} />
        </div>
      </div>
      <TeacherWorkDaysSelect teacherId={teacher.id} nickname={teacher.nickname} workDays={teacher.workDays} />
    </div>
  );
}

// ───────────── แถวครู Freelance (มี income + limit) ─────────────

function FreelanceRow({
  teacher,
  onToggle,
  onEdit,
}: {
  teacher: TeacherView;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const { format } = useWorkDays();
  const setOverride = useSetLimitOverride();

  // งบฟรีแลนซ์รายเดือน (สตางค์) มาจาก back-office EXPENSE item — ตัดตอนจอง (SPEC-001).
  const remainingMinor = teacher.remainingMinor ?? null;
  const budgetMinor = teacher.budgetMinor ?? null;
  const hasBudget = remainingMinor != null || budgetMinor != null;
  // rawOver = งบหมดจริง (ก่อนคิด override) → ใช้โชว์สวิตช์ override ให้กดปิดได้แม้เปิดค้างอยู่
  const rawOver = remainingMinor != null && remainingMinor <= 0;
  const nearCap =
    !rawOver &&
    remainingMinor != null &&
    teacher.reorderMinor != null &&
    remainingMinor <= teacher.reorderMinor;
  const reached = rawOver;

  const pct =
    budgetMinor != null && budgetMinor > 0
      ? Math.min(100, Math.max(0, (Math.max(0, remainingMinor ?? 0) / budgetMinor) * 100))
      : 0;

  const barColor = rawOver
    ? MANTINE_COLOR.danger
    : nearCap
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
        <div className="min-w-0 flex-1">
          <p className="font-medium">{teacher.name}</p>
          <p className="text-xs text-default-400">
            ({teacher.nickname}) · {format(teacher.workDays)} · ฿{thb(teacher.hourlyRate ?? 0)}{t("teachers.perHour")}
          </p>
          <SubjectChips subjects={teacher.subjects} />
        </div>
        <div className="flex items-center gap-2">
          {teacher.setupIncomplete ? (
            <Badge color="yellow" variant="light">
              {t("teachers.setupIncomplete")}
            </Badge>
          ) : teacher.overLimit ? (
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
            disabled={(teacher.overLimit && !teacher.limitOverride) || teacher.setupIncomplete}
            aria-label={t("teachers.toggleStatus", { name: teacher.name })}
          />
          <TeacherRowActions teacher={teacher} onEdit={onEdit} />
        </div>
      </div>

      {/* รายได้เดือนนี้ + งบฟรีแลนซ์คงเหลือ (บาท, จาก back-office) */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-default-500">
          <span className="flex items-center gap-1">
            <Wallet size={13} /> {t("teachers.monthIncome")}
          </span>
          <span>
            ฿{thb(teacher.monthlyIncome)} · {t("teachers.hours", { n: teacher.monthlyHours })}
          </span>
        </div>
        {hasBudget && (
          <>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-default-500">{t("teachers.budgetRemaining")}</span>
              <span
                className={`font-medium ${
                  rawOver ? "text-danger" : nearCap ? "text-warning" : "text-default-600"
                }`}
              >
                ฿{bahtOfSatang(remainingMinor ?? 0)}
                {budgetMinor != null && (
                  <span className="text-default-400"> / ฿{bahtOfSatang(budgetMinor)}</span>
                )}
              </span>
            </div>
            <Progress size="md" radius="xl" value={pct} color={barColor} />
          </>
        )}
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

      <FreelanceBudgetControls teacher={teacher} />

      <TeacherWorkDaysSelect teacherId={teacher.id} nickname={teacher.nickname} workDays={teacher.workDays} />
    </div>
  );
}
