"use client";

// PLACEHOLDER data source for the Overview screen. Generates plausible, scope-scaled numbers so the
// UI renders and can be reviewed before the backend endpoint exists. Swap the body of `buildOverview`
// for a real `getOverview(scope)` service call (page → partial → hook → service) when the API lands.
// Numbers are seeded by the scope dates, so a given range is stable across renders.

import { useMemo } from "react";
import dayjs from "dayjs";
import { SOM_UNKNOWN_KEY, type Breakdown } from "@/types/app/som";
import type {
  OverviewData,
  OverviewScope,
  TrendPoint,
  BadgeSlice,
  TeacherWorkload,
} from "@/types/app/overview";

// Tiny deterministic PRNG (mulberry32) so mock numbers don't jump every render.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function breakdown(entries: { key: string; label?: string; count: number }[], unknown: number): Breakdown {
  const buckets = entries.map((e) => ({ key: e.key, label: e.label ?? null, count: e.count }));
  if (unknown > 0) buckets.push({ key: SOM_UNKNOWN_KEY, label: null, count: unknown });
  const known = entries.reduce((s, e) => s + e.count, 0);
  return { buckets, known, unknown, total: known + unknown };
}

const TEACHERS: { id: string; nickname: string; type: TeacherWorkload["type"] }[] = [
  { id: "t1", nickname: "ครูโบ๊ท", type: "FULL_TIME" },
  { id: "t2", nickname: "ครูมิ้น", type: "FULL_TIME" },
  { id: "t3", nickname: "ครูเจ", type: "PART_TIME" },
  { id: "t4", nickname: "ครูป่าน", type: "PART_TIME" },
  { id: "t5", nickname: "ครูนัท", type: "FREELANCE" },
  { id: "t6", nickname: "ครูฟิล์ม", type: "FREELANCE" },
];

// Badge here is used ONLY for สาขา (branch/location) — NOT the course activity.
// Kept deliberately distinct from ACTIVITIES so the two never read as the same axis.
const BRANCHES: { valueId: string; label: string; color: string }[] = [
  { valueId: "br1", label: "สาขาเอกมัย", color: "blue" },
  { valueId: "br2", label: "สาขาทองหล่อ", color: "teal" },
  { valueId: "br3", label: "สาขาราชพฤกษ์", color: "grape" },
  { valueId: "br4", label: "สาขาบางนา", color: "orange" },
];

const ACTIVITIES: { key: string; label: string }[] = [
  { key: "balance_bike", label: "Balance Bike" },
  { key: "scooter", label: "Scooter" },
  { key: "surfskate", label: "Surfskate" },
  { key: "skate", label: "Skate" },
];

const CUSTOMER_NAMES = [
  "น้องปลื้ม", "น้องข้าวปั้น", "น้องเจได", "น้องมีมี่", "น้องโตโต้", "น้องพราว",
  "น้องต้นน้ำ", "น้องเฟิร์น", "น้องอิ่มบุญ", "น้องภูมิ", "น้องปุยฝ้าย", "น้องข้าวหอม",
  "น้องเจ้าขุน", "น้องน้ำหนึ่ง", "น้องกันต์", "น้องพิม", "น้องเบนซ์", "น้องแทน",
  "น้องมะปราง", "น้องข้าวตู", "น้องไกด์", "น้องปันปัน", "น้องเจ้านาย", "น้องฟ้าใส",
  "น้องเทมส์", "น้องริว", "น้องอันดา", "น้องข้าวโอ๊ต", "น้องพีพี", "น้องมิว",
  "น้องเจแปน", "น้องปอนด์", "น้องนโม", "น้องข้าวฟ่าง", "น้องเซ้นต์", "น้องแพรว",
  "น้องกิ๊ก", "น้องตะวัน", "น้องเอิร์ธ", "น้องมิลิน", "น้องปีใหม่", "น้องข้าวเม่า",
];

function buildOverview(scope: OverviewScope): OverviewData {
  const rand = rng(seedOf(scope.from + scope.to));
  const start = dayjs(scope.from);
  const end = dayjs(scope.to);
  const days = Math.max(1, end.diff(start, "day") + 1);
  const intn = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));

  // Daily trend (drives the area chart + KPI sparklines).
  const trend: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const booked = intn(6, 22);
    const attended = Math.max(0, booked - intn(0, 4));
    trend.push({ date: start.add(i, "day").format("YYYY-MM-DD"), booked, attended });
  }

  const totalBooked = trend.reduce((s, d) => s + d.booked, 0);
  const attended = trend.reduce((s, d) => s + d.attended, 0);
  const onLeave = intn(1, Math.max(2, Math.round(totalBooked * 0.08)));
  const cancelled = intn(0, Math.max(1, Math.round(totalBooked * 0.05)));
  const pending = intn(2, Math.max(3, Math.round(totalBooked * 0.15)));
  const confirmed = Math.max(0, totalBooked - attended - pending - onLeave);
  const attendanceRate = totalBooked > 0 ? Math.round((attended / totalBooked) * 100) : 0;

  const byTeacher: TeacherWorkload[] = TEACHERS.map((t) => {
    const count = intn(0, Math.round((totalBooked / TEACHERS.length) * 1.6));
    return { teacherId: t.id, nickname: t.nickname, type: t.type, count, attended: Math.max(0, count - intn(0, 2)) };
  })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  const byBadge: BadgeSlice[] = BRANCHES.map((b) => ({ ...b, count: intn(3, Math.round(totalBooked * 0.5)) }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);

  const byBookingType = [
    { type: "COURSE_PACKAGE" as const, count: intn(4, Math.round(totalBooked * 0.5)) },
    { type: "SINGLE_SESSION" as const, count: intn(2, Math.round(totalBooked * 0.3)) },
    { type: "FIRST_TRIAL" as const, count: intn(1, Math.round(totalBooked * 0.2)) },
    { type: "VOUCHER" as const, count: intn(1, Math.round(totalBooked * 0.2)) },
  ].filter((b) => b.count > 0);

  // ── Money view (all THB) ─────────────────────────────────
  const byActivity = ACTIVITIES.map((a) => ({
    key: a.key,
    label: a.label,
    revenue: intn(25, 140) * 1000,
    avgPerCourse: intn(30, 90) * 100, // 3,000–9,000
  })).sort((x, y) => y.revenue - x.revenue);

  const byCategory = [
    { key: "course", label: "คอร์ส", revenue: intn(120, 320) * 1000 },
    { key: "voucher", label: "วอยเชอร์", revenue: intn(40, 120) * 1000 },
    { key: "single", label: "รายชั่วโมง", revenue: intn(10, 40) * 1000 },
    { key: "retail", label: "สินค้าหน้าร้าน", revenue: intn(5, 25) * 1000 },
  ].sort((x, y) => y.revenue - x.revenue);

  const totalRevenue = byCategory.reduce((s, c) => s + c.revenue, 0);

  const topCustomers = CUSTOMER_NAMES.map((name, i) => {
    const act = ACTIVITIES[intn(0, ACTIVITIES.length - 1)];
    const courses = intn(1, 6);
    return {
      id: `c${i + 1}`,
      name,
      activity: act.label,
      courses,
      visits: courses * intn(3, 8),
      spend: intn(6, 60) * 1000,
    };
  }).sort((a, b) => b.spend - a.spend);

  // Active-course customers split by package size (4/6/10).
  const courseSizeSplit = [4, 6, 10].map((size) => ({ size, count: intn(8, 40) }));

  const activityCounts = (min: number, max: number) =>
    ACTIVITIES.map((a) => ({ key: a.key, label: a.label, count: intn(min, max) }));

  return {
    scope,
    generatedAt: dayjs().toISOString(),
    pulse: { totalBooked, attended, confirmed, pending, onLeave, cancelled, attendanceRate, trend },
    operations: { byTeacher, byBookingType, byBadge },
    business: {
      existingCustomers: {
        byCourse: intn(40, 90),
        byVoucher: intn(15, 45),
        byRecentTrial: intn(5, 25),
        total: 0, // filled below
      },
      courseSizeSplit,
      newCustomers: (() => {
        const viaRegister = intn(4, 16);
        const viaDirectSignup = intn(2, 10);
        const total = viaRegister + viaDirectSignup;
        return { total, viaRegister, viaDirectSignup, convertedToCourse: Math.round(total * (0.4 + rand() * 0.4)) };
      })(),
      newCourseByActivity: breakdown(activityCounts(1, 8), intn(0, 2)),
      activityShare: breakdown(
        [
          { key: "balance_bike", label: "Balance Bike", count: intn(20, 50) },
          { key: "scooter", label: "Scooter", count: intn(15, 40) },
          { key: "surfskate", label: "Surfskate", count: intn(10, 35) },
          { key: "skate", label: "Skate", count: intn(8, 28) },
        ],
        intn(0, 6),
      ),
      demographics: {
        gender: breakdown(
          [
            { key: "male", count: intn(30, 70) },
            { key: "female", count: intn(30, 70) },
          ],
          intn(2, 10),
        ),
        ageBand: breakdown(
          [
            { key: "3-5", label: "3–5", count: intn(20, 45) },
            { key: "6-9", label: "6–9", count: intn(25, 55) },
            { key: "10-12", label: "10–12", count: intn(10, 30) },
            { key: "13+", label: "13+", count: intn(5, 20) },
          ],
          intn(1, 8),
        ),
        province: breakdown(
          [
            { key: "bangkok", label: "กรุงเทพฯ", count: intn(40, 80) },
            { key: "nonthaburi", label: "นนทบุรี", count: intn(10, 30) },
            { key: "samutprakan", label: "สมุทรปราการ", count: intn(8, 25) },
            { key: "pathumthani", label: "ปทุมธานี", count: intn(5, 18) },
          ],
          intn(2, 12),
        ),
        nationality: breakdown(
          [
            { key: "thai", label: "ไทย", count: intn(60, 110) },
            { key: "other", label: "อื่นๆ", count: intn(5, 20) },
          ],
          intn(0, 5),
        ),
      },
    },
    revenue: {
      total: totalRevenue,
      byCategory,
      byActivity,
      topCustomers,
    },
  };
}

export function useOverview(scope: OverviewScope) {
  const data = useMemo(() => {
    const d = buildOverview(scope);
    d.business.existingCustomers.total =
      d.business.existingCustomers.byCourse +
      d.business.existingCustomers.byVoucher +
      d.business.existingCustomers.byRecentTrial;
    return d;
  }, [scope.from, scope.to, scope.preset]);

  return { data, isLoading: false as const };
}
