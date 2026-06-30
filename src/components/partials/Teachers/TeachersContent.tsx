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
import { formatWorkDaysLabel } from "@/lib/scheduler/work-days";
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
  const { data: teachers = [], isLoading } = useTeachers();
  const { data: typeOrder = [] } = useTeacherTypeOrder();
  const toggle = useToggleTeacher();
  const toggleType = useToggleTeacherType();
  const setOrder = useSetTeacherTypeOrder();

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-default-500">
        <Loader size="md" />
        กำลังโหลด...
      </div>
    );
  }

  const handleToggleType = (type: TeacherType, active: boolean) => {
    toggleType.mutate({ type, active });
    notify({
      title: `${active ? "เปิด" : "ปิด"}รับงานครู ${TEACHER_TYPE_LABEL[type]} ทั้งหมด`,
      description: active ? undefined : "ครูกลุ่มนี้จะไม่แสดงในตารางจองของเดือนนี้",
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
        <p className="mb-1 text-sm font-semibold">ลำดับความสำคัญการจัดครู</p>
        <p className="mb-3 text-xs text-default-400">
          ครูจะเรียงตามลำดับนี้ในตารางจอง — เลื่อนประเภทที่อยากเน้นช่วงนี้ขึ้นบนสุด
        </p>
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
                            aria-label="ลากเพื่อจัดลำดับ"
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

      <p className="text-sm text-default-500">
        ปิดสิทธิ์รับงานเพื่อไม่ให้ครูแสดงในตารางจอง · ครู Freelance ที่รายได้ถึงเพดานจะถูกปิดอัตโนมัติ
      </p>

      {typeOrder.map((type) => {
        const group = teachers.filter((t) => t.type === type);
        if (group.length === 0) return null;
        const allActive = group.every((t) => t.active);

        return (
          <Card key={type} padding="md">
            <Group justify="space-between" mb="sm">
              <div className="flex items-center gap-2">
                <TeacherTypeChip type={type} size="md" />
                <span className="text-sm text-default-400">{group.length} คน</span>
              </div>
              <Button
                size="xs"
                variant="light"
                color={allActive ? "gray" : "green"}
                leftSection={allActive ? <PowerOff size={15} /> : <Power size={15} />}
                onClick={() => handleToggleType(type, !allActive)}
              >
                {allActive ? "ปิดทั้งกลุ่ม" : "เปิดทั้งกลุ่ม"}
              </Button>
            </Group>
            <Stack gap="xs">
              {group.map((t) =>
                t.type === "FREELANCE" ? (
                  <FreelanceRow key={t.id} teacher={t} onToggle={() => toggle.mutate({ id: t.id, active: !t.active })} />
                ) : (
                  <TeacherRow key={t.id} teacher={t} onToggle={() => toggle.mutate({ id: t.id, active: !t.active })} />
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

function TeacherRow({ teacher: t, onToggle }: { teacher: TeacherView; onToggle: () => void }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border border-default-100 p-3 transition-colors hover:bg-default-100/60 ${
        t.active ? "" : "opacity-60"
      }`}
    >
      <div>
        <p className="font-medium">{t.name}</p>
        <p className="text-xs text-default-400">
          ({t.nickname}) · {formatWorkDaysLabel(t.workDays)}
          {t.subjects.length > 0 ? ` · ${t.subjects.slice(0, 3).join(", ")}${t.subjects.length > 3 ? "…" : ""}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs ${t.active ? "text-success" : "text-default-400"}`}>
          {t.active ? "รับงาน" : "ปิดรับงาน"}
        </span>
        <Switch checked={t.active} onChange={onToggle} aria-label={`สลับสถานะ ${t.name}`} />
      </div>
    </div>
  );
}

// ───────────── แถวครู Freelance (มี income + limit) ─────────────

function FreelanceRow({ teacher: t, onToggle }: { teacher: TeacherView; onToggle: () => void }) {
  const setOverride = useSetLimitOverride();

  // เพดานรายได้มาจาก back-office (read-only ในระบบนี้)
  const limitNum = t.incomeLimit ?? 0;
  const pct = limitNum > 0 ? Math.min(100, (t.monthlyIncome / limitNum) * 100) : 0;
  const reached = limitNum > 0 && t.monthlyIncome >= limitNum;

  const barColor = t.overLimit
    ? MANTINE_COLOR.danger
    : pct >= 80
      ? MANTINE_COLOR.warning
      : MANTINE_COLOR.success;

  const handleOverride = (on: boolean) => {
    setOverride.mutate({ id: t.id, override: on });
    notify({
      title: on ? "เปิดรับงานต่อ (override)" : "ปิด override",
      description: on ? `${t.nickname} รับงานต่อแม้เกินเพดาน` : undefined,
      color: on ? "warning" : "default",
    });
  };

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        t.overLimit ? "border-danger/30 bg-danger/5" : "border-default-100 hover:bg-default-100/60"
      } ${!t.active && !t.overLimit ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{t.name}</p>
          <p className="text-xs text-default-400">
            ({t.nickname}) · {formatWorkDaysLabel(t.workDays)} · ฿{thb(t.hourlyRate ?? 0)}/ชม.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {t.overLimit ? (
            <Badge color="red" variant="light">
              เกินเพดาน · ปิดอัตโนมัติ
            </Badge>
          ) : (
            <span className={`text-xs ${t.active ? "text-success" : "text-default-400"}`}>
              {t.active ? "รับงาน" : "ปิดรับงาน"}
            </span>
          )}
          <Switch
            checked={t.active}
            onChange={onToggle}
            disabled={t.overLimit && !t.limitOverride}
            aria-label={`สลับสถานะ ${t.name}`}
          />
        </div>
      </div>

      {/* income vs limit (เพดานจาก back-office) */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-default-500">
          <span className="flex items-center gap-1">
            <Wallet size={13} /> รายได้เดือนนี้
          </span>
          <span>
            ฿{thb(t.monthlyIncome)}{" "}
            {limitNum > 0 && <span className="text-default-400">/ เพดาน ฿{thb(limitNum)}</span>} ·{" "}
            {t.monthlyHours} ชม.
          </span>
        </div>
        <Progress size="md" radius="xl" value={pct} color={barColor} />
      </div>

      {reached && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="text-xs text-default-500">เปิดรับงานต่อแม้เกินเพดาน</span>
          <Switch
            checked={!!t.limitOverride}
            onChange={(e) => handleOverride(e.currentTarget.checked)}
            color="orange"
            aria-label="override เพดานรายได้"
          />
        </div>
      )}
    </div>
  );
}
