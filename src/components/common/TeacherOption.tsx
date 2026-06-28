"use client";

import type { ComboboxItem } from "@mantine/core";
import type { Teacher } from "@/types/app/scheduler";
import { TEACHER_TYPE_LABEL } from "@/types/app/scheduler";
import { TeacherTypeChip } from "./BookingBadges";

type TeacherLike = Pick<Teacher, "id" | "nickname" | "type">;

/**
 * Select data ของครู — label มี type ติดไปด้วย ("ชื่อ · Freelance")
 * เพื่อให้ช่อง input ที่เลือกแล้วบอกประเภทครูได้ (Mantine แสดง label text)
 */
export const teacherSelectData = (teachers: TeacherLike[]) =>
  teachers.map((t) => ({
    value: t.id,
    label: `${t.nickname} · ${TEACHER_TYPE_LABEL[t.type]}`,
  }));

/**
 * แสดงตัวเลือกครูใน dropdown (ชื่อ ──── type chip) — ใช้ผ่าน renderOption
 * ดึงชื่อจาก lookup ไม่ใช้ option.label เพื่อกัน type ซ้ำ (label มี type อยู่แล้ว)
 * ตัวเลือกที่ไม่ใช่ครู (เช่น "ครูทุกคน") จะแสดง label ปกติ ไม่มี chip
 */
export function TeacherOption({
  option,
  teachers,
}: {
  option: ComboboxItem;
  teachers: TeacherLike[];
}) {
  const t = teachers.find((x) => x.id === option.value);
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <span>{t ? t.nickname : option.label}</span>
      {t && <TeacherTypeChip type={t.type} />}
    </div>
  );
}
