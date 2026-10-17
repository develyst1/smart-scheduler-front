import { api, useMockData } from "@/lib/api/client";
import { fillSomPreview } from "@/lib/som/preview";
import {
  SOM_UNKNOWN_KEY,
  type NvrBucket,
  type NvrDetailRow,
  type SomQuery,
  type SomReport,
} from "@/types/app/som";

// Offline mock — deliberately a "just after launch" snapshot: demographics are MOSTLY unknown, so the
// coverage line ("based on X of Y") and the unknown bucket are exercised, not just a clean pie.
const mockSom = (): SomReport => {
  const bd = (
    buckets: { key: string; label?: string | null; count: number }[],
    total: number,
  ) => {
    const unknown = buckets.find((b) => b.key === SOM_UNKNOWN_KEY)?.count ?? 0;
    return { buckets, known: total - unknown, unknown, total };
  };
  return {
    existingCustomers: {
      byCourse: 12,
      byVoucher: 7,
      byRecentTrial: 5,
      total: 20,
      recentTrialSince: "2026-05-01",
    },
    sportShare: bd(
      [
        { key: "surf", label: "Surfskate", count: 9 },
        { key: "scooter", label: "Scooter", count: 5 },
        { key: "bike", label: "Balance bike", count: 3 },
        { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 3 },
      ],
      20,
    ),
    newVsRenewing: {
      month: "2026-08",
      newByFirstTrial: 4,
      newByRegistration: 3,
      renewing: 2,
    },
    demographics: {
      gender: bd(
        [
          { key: "male", count: 3 },
          { key: "female", count: 2 },
          { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 15 },
        ],
        20,
      ),
      ageBand: bd(
        [
          { key: "1-2", count: 0 },
          { key: "3-4", count: 1 },
          { key: "5-7", count: 1 },
          { key: "8-10", count: 1 },
          { key: "11-13", count: 0 },
          { key: "14-19", label: "14+", count: 0 },
          { key: "20-39", label: "20+", count: 0 },
          { key: "40-54", label: "40+", count: 0 },
          { key: "55+", count: 0 },
          { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 17 },
        ],
        20,
      ),
      district: bd(
        [
          { key: "10-bangrak", label: "บางรัก, กรุงเทพมหานคร", count: 3 },
          { key: "10-sathon", label: "สาทร, กรุงเทพมหานคร", count: 1 },
          { key: "83-kathu", label: "กะทู้, ภูเก็ต", count: 1 },
          { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 15 },
        ],
        20,
      ),
      province: bd(
        [
          { key: "กรุงเทพมหานคร", count: 4 },
          { key: "ภูเก็ต", count: 1 },
          { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 15 },
        ],
        20,
      ),
      nationality: bd(
        [
          { key: "ไทย", count: 5 },
          { key: SOM_UNKNOWN_KEY, label: "ไม่ระบุ", count: 15 },
        ],
        20,
      ),
    },
    today: { date: "2026-08-01", expected: 18, attended: 11 },
    activityProgram: {
      categories: [
        {
          key: "bike",
          label: "Bike",
          course: 9,
          voucher: 4,
          singleSession: 2,
          typeTotal: 15,
          firstTrial: 3,
          total: 18,
        },
        {
          key: "surfskate",
          label: "Surfskate",
          course: 6,
          voucher: 3,
          singleSession: 1,
          typeTotal: 10,
          firstTrial: 2,
          total: 12,
        },
        {
          key: "inlineskate",
          label: "Inline skate",
          course: 3,
          voucher: 1,
          singleSession: 0,
          typeTotal: 4,
          firstTrial: 1,
          total: 5,
        },
        {
          key: "balance-play",
          label: "Balance Play",
          course: 4,
          voucher: 0,
          singleSession: 1,
          typeTotal: 5,
          firstTrial: 2,
          total: 7,
        },
        {
          key: "other",
          label: "Other",
          course: 1,
          voucher: 1,
          singleSession: 0,
          typeTotal: 2,
          firstTrial: 0,
          total: 2,
        },
      ],
    },
    coachCapacity: {
      month: "2026-08",
      byPerson: [
        {
          teacherId: "t1",
          teacherType: "FULL_TIME",
          bookedHours: 132,
          availableHours: 202,
          weekdayBookedHours: 92,
          weekdayAvailableHours: 158,
          weekdayPct: 58,
          weekendBookedHours: 40,
          weekendAvailableHours: 44,
          weekendPct: 91,
        },
        {
          teacherId: "t2",
          teacherType: "FULL_TIME",
          bookedHours: 101,
          availableHours: 207,
          weekdayBookedHours: 63,
          weekdayAvailableHours: 158,
          weekdayPct: 40,
          weekendBookedHours: 38,
          weekendAvailableHours: 49,
          weekendPct: 78,
        },
        {
          teacherId: "t3",
          teacherType: "PART_TIME",
          bookedHours: 61,
          availableHours: 72,
          weekdayBookedHours: 0,
          weekdayAvailableHours: 0,
          weekdayPct: 0,
          weekendBookedHours: 61,
          weekendAvailableHours: 72,
          weekendPct: 85,
        },
        {
          teacherId: "t4",
          teacherType: "PART_TIME",
          bookedHours: 70,
          availableHours: 189,
          weekdayBookedHours: 70,
          weekdayAvailableHours: 189,
          weekdayPct: 37,
          weekendBookedHours: 0,
          weekendAvailableHours: 0,
          weekendPct: 0,
        },
      ],
      byType: [
        {
          teacherType: "FULL_TIME",
          coaches: 2,
          bookedHours: 233,
          availableHours: 409,
          weekdayBookedHours: 155,
          weekdayAvailableHours: 316,
          weekdayPct: 49,
          weekendBookedHours: 78,
          weekendAvailableHours: 93,
          weekendPct: 84,
        },
        {
          teacherType: "PART_TIME",
          coaches: 2,
          bookedHours: 131,
          availableHours: 261,
          weekdayBookedHours: 70,
          weekdayAvailableHours: 189,
          weekdayPct: 37,
          weekendBookedHours: 61,
          weekendAvailableHours: 72,
          weekendPct: 85,
        },
        {
          teacherType: "FREELANCE",
          coaches: 0,
          bookedHours: 0,
          availableHours: 0,
          weekdayBookedHours: 0,
          weekdayAvailableHours: 0,
          weekdayPct: 0,
          weekendBookedHours: 0,
          weekendAvailableHours: 0,
          weekendPct: 0,
        },
      ],
    },
    generatedAt: "2026-08-01T09:15:00.000Z",
  };
};

/** REQ-013: the whole SOM dashboard from one snapshot. The FE renders it as-is. */
// `month` + `badgeValueIds` (comma-joined, omitted = all branches) go on every SOM request. A server that does not
// read them yet just ignores them and answers its usual snapshot.
const somParams = (q: SomQuery) => ({
  month: q.month,
  ...(q.badgeValueIds.length > 0
    ? { badgeValueIds: q.badgeValueIds.join(",") }
    : {}),
});

export const getSomReport = async (q: SomQuery): Promise<SomReport> => {
  // Fields the API does not send yet are filled with preview numbers for the client demo (lib/som/preview.ts).
  if (useMockData) return fillSomPreview(mockSom(), q.month);
  const { data } = await api.get<SomReport>("/reports/som", {
    params: somParams(q),
  });
  return fillSomPreview(data, q.month);
};

const mockNvrDetail = (bucket: NvrBucket): NvrDetailRow[] => {
  const course = (
    i: number,
    label: string,
    course: string,
    trial: string | null,
  ): NvrDetailRow => ({
    studentId: `st${i}`,
    studentName: [
      "น้องข้าวหอม",
      "น้องไทม์",
      "น้องมะลิ",
      "น้องปีใหม่",
      "น้องภูผา",
    ][i % 5],
    packageLabel: label,
    courseTeacherId: course,
    trialTeacherId: trial,
    trialDate: trial ? "2026-10-04" : null,
    date: "2026-10-12",
    remark: i % 2 === 0 ? "ผู้ปกครองขอเรียนวันเสาร์" : null,
  });
  switch (bucket) {
    case "newCourseThisMonth":
      return [
        course(0, "Course 10 · Bike", "t1", "t3"),
        course(1, "Course 4 · Skate", "t4", null),
        course(2, "Course 6 · Bike", "t1", "t1"),
      ];
    case "newCoursePrevMonth":
      return [
        {
          ...course(3, "Course 10 · Surfskate", "t2", "t4"),
          trialDate: "2026-09-21",
        },
      ];
    case "renewCourse":
      return [
        course(4, "Voucher 10 hrs", "t3", null),
        course(1, "Course 10 · Skate", "t4", null),
      ];
    case "notRenewed":
      return [
        { ...course(2, "Course 4 · Bike", "t1", null), date: "2026-10-08" },
      ];
    default:
      return [0, 1, 2].map((i) => ({
        ...course(i, "", "", "t3"),
        packageLabel: null,
        courseTeacherId: null,
      }));
  }
};

/** Who is behind one New-vs-Renewing card, for the month the snapshot reports. */
export const getNvrDetail = async (
  bucket: NvrBucket,
  q: SomQuery,
): Promise<NvrDetailRow[]> => {
  if (useMockData) return mockNvrDetail(bucket);
  const { data } = await api.get<{ rows: NvrDetailRow[] }>(
    `/reports/som/new-vs-renewing/${bucket}`,
    { params: somParams(q) },
  );
  return data.rows;
};
