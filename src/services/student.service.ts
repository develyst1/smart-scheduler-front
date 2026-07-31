import { api } from "@/lib/api/client";
import type { StudentListItem, StudentsResponse } from "@/types/api/contract";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

// Mock student list (offline dev). A suspended household's student + a walk-in (no parent). The backend now
// excludes suspended households from `/students` **by default** (TASK-058), so the mock filters them
// unconditionally to match — a suspended family can neither be booked nor sold to.
const MOCK_STUDENTS: (StudentListItem & { suspended?: boolean })[] = [
  { id: "ms1", name: "น้องพีพี ใจดี", nickname: "พีพี", phone: "0811111111", parentId: "p1", parentName: "สมชาย ใจดี", label: "น้องพีพี ใจดี (0811111111)" },
  { id: "ms2", name: "น้องมีมี่ ใจดี", nickname: "มีมี่", phone: "0811111111", parentId: "p1", parentName: "สมชาย ใจดี", label: "น้องมีมี่ ใจดี (0811111111)" },
  { id: "ms3", name: "น้องเบล (ครอบครัวถูกระงับ)", nickname: "เบล", phone: "0833333333", parentId: "p3", parentName: "สุดา รักเรียน", label: "น้องเบล (0833333333)", suspended: true },
  { id: "ms4", name: "น้องวอล์คอิน (ไม่มีผู้ปกครอง)", nickname: null, phone: null, parentId: null, parentName: null, label: "น้องวอล์คอิน" },
];

/** Student picker source — searchable by name / nickname / parent phone. Suspended households are excluded
 *  by the server (TASK-058), so every consumer (booking picker + sale modals) gets the filtered list. */
export const searchStudents = async (q?: string, limit = 50): Promise<StudentsResponse> => {
  if (useMock) {
    const term = q?.trim().toLowerCase();
    return MOCK_STUDENTS.filter((s) => !s.suspended)
      .filter((s) => (term ? s.name.toLowerCase().includes(term) || (s.phone ?? "").includes(term) : true))
      .slice(0, limit)
      .map(({ suspended: _suspended, ...rest }) => rest);
  }
  const { data } = await api.get<StudentsResponse>("/students", {
    params: { ...(q ? { q } : {}), limit },
  });
  return data;
};
