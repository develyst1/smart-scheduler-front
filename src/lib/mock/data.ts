import dayjs from "dayjs";
import type {
  Booking,
  CoursePackage,
  Teacher,
} from "@/types/app/scheduler";

// In-memory mock store. Replaces a real backend for now so the UI is fully
// interactive. Swap services/lib-api to real endpoints later (Phase 3).

export const teachers: Teacher[] = [
  { id: "t1", name: "ครูแอน สมใจ", nickname: "แอน", type: "FULL_TIME", subjects: ["คณิต", "ฟิสิกส์"], active: true },
  { id: "t2", name: "ครูบีม รุ่งโรจน์", nickname: "บีม", type: "FULL_TIME", subjects: ["อังกฤษ"], active: true },
  { id: "t3", name: "ครูแคท ปิยะดา", nickname: "แคท", type: "PART_TIME", subjects: ["เคมี", "ชีวะ"], active: true },
  { id: "t4", name: "ครูดิว ธนพล", nickname: "ดิว", type: "PART_TIME", subjects: ["คณิต"], active: true },
  { id: "t5", name: "ครูเอิร์ธ กิตติ", nickname: "เอิร์ธ", type: "FREELANCE", subjects: ["อังกฤษ", "IELTS"], active: true },
  { id: "t6", name: "ครูฟ้า ชนิดา", nickname: "ฟ้า", type: "FREELANCE", subjects: ["ภาษาไทย"], active: false },
];

const today = dayjs().format("YYYY-MM-DD");

export const coursePackages: CoursePackage[] = [
  {
    id: "c1",
    studentName: "น้องพีพี",
    size: 10,
    usedSessions: 3,
    leaveUsed: 1,
    adminUnlocked: false,
    startDate: dayjs().subtract(3, "week").format("YYYY-MM-DD"),
    weekday: 0,
    startTime: "10:00",
    expiryDate: dayjs().add(10, "week").format("YYYY-MM-DD"),
  },
  {
    id: "c2",
    studentName: "น้องเจมส์",
    size: 4,
    usedSessions: 1,
    leaveUsed: 1,
    adminUnlocked: false,
    startDate: dayjs().subtract(1, "week").format("YYYY-MM-DD"),
    weekday: 2,
    startTime: "14:00",
    expiryDate: dayjs().add(4, "week").format("YYYY-MM-DD"),
  },
  {
    id: "c3",
    studentName: "น้องมายด์",
    size: 6,
    usedSessions: 4,
    leaveUsed: 2,
    adminUnlocked: false,
    startDate: dayjs().subtract(4, "week").format("YYYY-MM-DD"),
    weekday: 5,
    startTime: "16:00",
    expiryDate: dayjs().add(2, "week").format("YYYY-MM-DD"),
  },
];

export const bookings: Booking[] = [
  { id: "b1", studentName: "น้องพีพี", teacherId: "t1", subject: "คณิต", date: today, startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "CONFIRMED", courseId: "c1" },
  { id: "b2", studentName: "น้องโอ๊ค", teacherId: "t1", subject: "ฟิสิกส์", date: today, startTime: "13:00", endTime: "14:00", bookingType: "SINGLE_SESSION", status: "ATTENDED" },
  { id: "b3", studentName: "น้องเบล", teacherId: "t2", subject: "อังกฤษ", date: today, startTime: "11:00", endTime: "12:00", bookingType: "FIRST_TRIAL", status: "PENDING", note: "ทักมาทาง Line ขอทดลองเรียน" },
  { id: "b4", studentName: "น้องมิ้น", teacherId: "t2", subject: "อังกฤษ", date: today, startTime: "15:00", endTime: "16:00", bookingType: "VOUCHER", status: "CONFIRMED" },
  { id: "b5", studentName: "น้องเจมส์", teacherId: "t3", subject: "เคมี", date: today, startTime: "14:00", endTime: "15:00", bookingType: "COURSE_PACKAGE", status: "SICK_LEAVE", courseId: "c2" },
  { id: "b6", studentName: "น้องแพร", teacherId: "t4", subject: "คณิต", date: today, startTime: "10:00", endTime: "11:00", bookingType: "SINGLE_SESSION", status: "CONFIRMED" },
  { id: "b7", studentName: "น้องกัน", teacherId: "t5", subject: "IELTS", date: today, startTime: "16:00", endTime: "17:00", bookingType: "VOUCHER", status: "CONFIRMED" },
  { id: "b8", studentName: "น้องมายด์", teacherId: "t3", subject: "ชีวะ", date: today, startTime: "16:00", endTime: "17:00", bookingType: "COURSE_PACKAGE", status: "EXTENDED", courseId: "c3", note: "คาบขยายจากการลาสัปดาห์ก่อน" },
  { id: "b9", studentName: "น้องนิว", teacherId: "t1", subject: "คณิต", date: dayjs().add(1, "day").format("YYYY-MM-DD"), startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "CONFIRMED", courseId: "c1" },
];

let bookingSeq = bookings.length;
export const nextBookingId = () => `b${++bookingSeq}`;
