"use client";

import { CheckIcon, type ComboboxItem } from "@mantine/core";
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
 * แสดงตัวเลือกครูใน dropdown (✓ ชื่อ ──── type chip) — ใช้ผ่าน renderOption
 * ดึงชื่อจาก lookup ไม่ใช้ option.label เพื่อกัน type ซ้ำ (label มี type อยู่แล้ว)
 * ตัวเลือกที่ไม่ใช่ครู (เช่น "ครูทุกคน") จะแสดง label ปกติ ไม่มี chip
 *
 * 🔴 **`checked` ต้องรับและต้องวาด.** Mantine วาดเครื่องหมายถูกให้เอง **เฉพาะตอนใช้ตัว render เริ่มต้น** —
 * `renderOption` แทนที่ทั้งแถว ดังนั้น renderer ที่ไม่สนใจ `checked` จะ **ลบสถานะ "เลือกแล้ว" ทิ้งเงียบๆ**
 * ไม่มี error ไม่มี warning. บน `Select` ยังพออ่านออกเพราะค่าที่เลือกโผล่ในช่อง input แต่บน **`MultiSelect`
 * ที่ dropdown เปิดค้างไว้ (ฟอร์ม อื่นๆ — ครูหลายคน) ไม่เหลืออะไรบอกเลยว่าแถวไหนถูกเลือกไปแล้ว** — และหน้า
 * เดียวกันนั้นมี MultiSelect ตัวอื่น (ประเภทครู / badge) ที่ไม่ได้ใส่ `renderOption` แล้วมีเครื่องหมายถูกปกติ
 * ⇒ อ่านเหมือนคอนโทรลเดียวกันทำงานไม่เหมือนกัน
 *
 * ช่องของไอคอนกันที่ไว้เสมอ (`opacity-0` ตอนไม่ถูกเลือก) เพื่อไม่ให้ชื่อครูขยับตอน toggle
 */
export function TeacherOption({
  option,
  checked,
  teachers,
}: {
  option: ComboboxItem;
  /** Mantine ส่งมาให้ทาง `renderOption` — ต้องส่งต่อจากทุก call site ไม่งั้นเครื่องหมายถูกหายไปทั้งใบ */
  checked?: boolean;
  teachers: TeacherLike[];
}) {
  const t = teachers.find((x) => x.id === option.value);
  return (
    <div className="flex w-full items-center gap-2">
      <CheckIcon size={12} aria-hidden className={checked ? "shrink-0" : "shrink-0 opacity-0"} />
      <span className="min-w-0 flex-1 truncate">{t ? t.nickname : option.label}</span>
      {t && <TeacherTypeChip type={t.type} />}
    </div>
  );
}
