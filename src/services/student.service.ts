import { api } from "@/lib/api/client";
import type { StudentListItem, StudentsResponse } from "@/types/api/contract";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

// Mock booking-picker students (offline dev). One belongs to a SUSPENDED household → hidden from the booking
// picker when bookable=true (TASK-056/057); the walk-in (no parent) is always bookable.
const MOCK_STUDENTS: (StudentListItem & { suspended?: boolean })[] = [
  { id: "ms1", name: "น้องพีพี ใจดี", nickname: "พีพี", phone: "0811111111", parentId: "p1", parentName: "สมชาย ใจดี", label: "น้องพีพี ใจดี (0811111111)" },
  { id: "ms2", name: "น้องมีมี่ ใจดี", nickname: "มีมี่", phone: "0811111111", parentId: "p1", parentName: "สมชาย ใจดี", label: "น้องมีมี่ ใจดี (0811111111)" },
  { id: "ms3", name: "น้องเบล (ครอบครัวถูกระงับ)", nickname: "เบล", phone: "0833333333", parentId: "p3", parentName: "สุดา รักเรียน", label: "น้องเบล (0833333333)", suspended: true },
  { id: "ms4", name: "น้องวอล์คอิน (ไม่มีผู้ปกครอง)", nickname: null, phone: null, parentId: null, parentName: null, label: "น้องวอล์คอิน" },
];

/**
 * Booking dropdown source — students searchable by name / nickname / parent phone.
 * `opts.bookable` (booking picker ONLY) asks the backend to hide suspended households; the course/voucher
 * SALE modals must NOT pass it (selling isn't booking) — and it's part of the react-query key so the two
 * never share a cached result.
 */
export const searchStudents = async (
  q?: string,
  limit = 50,
  opts?: { bookable?: boolean },
): Promise<StudentsResponse> => {
  if (useMock) {
    const term = q?.trim().toLowerCase();
    return MOCK_STUDENTS.filter((s) => (opts?.bookable ? !s.suspended : true))
      .filter((s) => (term ? s.name.toLowerCase().includes(term) || (s.phone ?? "").includes(term) : true))
      .slice(0, limit)
      .map(({ suspended: _suspended, ...rest }) => rest);
  }
  const { data } = await api.get<StudentsResponse>("/students", {
    params: { ...(q ? { q } : {}), ...(opts?.bookable ? { bookable: true } : {}), limit },
  });
  return data;
};
