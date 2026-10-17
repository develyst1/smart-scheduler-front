// SOM dashboard PREVIEW figures (client demo, 2026-10-17).
//
// The redesign shows fields the live API does not send yet (docs/backend-som-dashboard.md). Until it does, every
// such field is filled here with plausible, deterministic numbers so the page can be shown to the client. Fields
// the API already sends are never touched — a live value always wins. Pure and framework-free.
//
// 🧹 Delete this file (and its call sites) once the backend ships every field in the handoff doc.

import {
  SOM_UNKNOWN_KEY,
  type ActivityCategory,
  type Breakdown,
  type CapacityFigures,
  type CoachCapacity,
  type NvrBucket,
  type NvrDetailRow,
  type SomReport,
} from "@/types/app/som";
import type { TeacherType } from "@/types/app/scheduler";

/** Deterministic 0..1 generator from a string seed — the same month shows the same preview on every refresh. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const between = (r: () => number, lo: number, hi: number) =>
  lo + Math.floor(r() * (hi - lo + 1));
const pct = (num: number, den: number) =>
  den > 0 ? Math.round((num / den) * 100) : 0;

/** Fill the snapshot's missing fields; live values pass through untouched. */
export function fillSomPreview(r: SomReport, month: string): SomReport {
  const rand = seeded(`som-${month}`);
  const ec = r.existingCustomers;
  const nvr = r.newVsRenewing;
  return {
    ...r,
    existingCustomers: {
      ...ec,
      recentSingleSession: ec.recentSingleSession ?? between(rand, 3, 9),
    },
    newVsRenewing: {
      ...nvr,
      newCourseThisMonth: nvr.newCourseThisMonth ?? between(rand, 3, 8),
      newCoursePrevMonth: nvr.newCoursePrevMonth ?? between(rand, 1, 5),
      trialNotConverted:
        nvr.trialNotConverted ??
        Math.round(nvr.newByFirstTrial * 0.4), // a subset of 1st Trial — never more than it
      notRenewed: nvr.notRenewed ?? between(rand, 2, 6),
    },
    demographics: {
      ...r.demographics,
      district: r.demographics.district ?? previewDistrict(rand),
    },
    activityProgram: r.activityProgram ?? previewActivity(r.sportShare, rand),
  };
}

// Activity / Program: keep the live categories and their live totals, split each into Type parts + 1st Trial.
function previewActivity(share: Breakdown, rand: () => number) {
  const categories: ActivityCategory[] = share.buckets
    .filter((b) => b.key !== SOM_UNKNOWN_KEY && b.count > 0)
    .map((b) => {
      const total = b.count;
      const firstTrial = Math.round(total * (0.15 + rand() * 0.15));
      const typeTotal = total - firstTrial;
      const course = Math.round(typeTotal * (0.5 + rand() * 0.2));
      const voucher = Math.round((typeTotal - course) * (0.5 + rand() * 0.3));
      const singleSession = typeTotal - course - voucher;
      return {
        key: b.key,
        label: b.label,
        course,
        voucher,
        singleSession,
        typeTotal,
        firstTrial,
        total,
      };
    });
  return { categories };
}

function previewDistrict(rand: () => number): Breakdown {
  const names = [
    "บางรัก, กรุงเทพมหานคร",
    "สาทร, กรุงเทพมหานคร",
    "วัฒนา, กรุงเทพมหานคร",
    "ปากเกร็ด, นนทบุรี",
    "บางพลี, สมุทรปราการ",
    "คลองเตย, กรุงเทพมหานคร",
    "เมืองภูเก็ต, ภูเก็ต",
  ];
  const buckets = names
    .map((label, i) => ({
      key: `preview-${i}`,
      label,
      count: between(rand, 1, 14),
    }))
    .sort((a, b) => b.count - a.count);
  const known = buckets.reduce((s, b) => s + b.count, 0);
  const unknown = between(rand, 3, 10);
  return {
    buckets: [...buckets, { key: SOM_UNKNOWN_KEY, count: unknown }],
    known,
    unknown,
    total: known + unknown,
  };
}

/** Coach capacity for the real coaches (names come from the teacher list), FT → PT → FL. */
export function previewCoachCapacity(
  teachers: { id: string; type: TeacherType; workDays?: number[] }[],
  month: string,
): CoachCapacity {
  const order: TeacherType[] = ["FULL_TIME", "PART_TIME", "FREELANCE"];
  const sorted = [...teachers].sort(
    (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
  );
  const byPerson = sorted.map((tc) => {
    const rand = seeded(`cap-${month}-${tc.id}`);
    const days = tc.workDays ?? [0, 1, 2, 3, 4, 5, 6];
    const weekdayDays = days.filter((d) => d >= 1 && d <= 5).length;
    const weekendDays = days.filter((d) => d === 0 || d === 6).length;
    // ~4.3 weeks a month × 9 one-hour slots a day.
    const weekdayAvailableHours = Math.round(
      weekdayDays * 4.3 * 9 * (tc.type === "FREELANCE" ? 0.4 : 1),
    );
    const weekendAvailableHours = Math.round(
      weekendDays * 4.3 * 9 * (tc.type === "FREELANCE" ? 0.4 : 1),
    );
    const weekdayBookedHours = Math.round(
      weekdayAvailableHours * (0.3 + rand() * 0.4),
    );
    const weekendBookedHours = Math.round(
      weekendAvailableHours * (0.6 + rand() * 0.35),
    );
    return {
      teacherId: tc.id,
      teacherType: tc.type,
      ...figures(
        weekdayBookedHours,
        weekdayAvailableHours,
        weekendBookedHours,
        weekendAvailableHours,
      ),
    };
  });
  const byType = order.map((type) => {
    const rows = byPerson.filter((p) => p.teacherType === type);
    const sum = (k: keyof CapacityFigures) =>
      rows.reduce((s, p) => s + p[k], 0);
    return {
      teacherType: type,
      coaches: rows.length,
      ...figures(
        sum("weekdayBookedHours"),
        sum("weekdayAvailableHours"),
        sum("weekendBookedHours"),
        sum("weekendAvailableHours"),
      ),
    };
  });
  return { month, byPerson, byType };
}

function figures(
  wdB: number,
  wdA: number,
  weB: number,
  weA: number,
): CapacityFigures {
  return {
    bookedHours: wdB + weB,
    availableHours: wdA + weA,
    weekdayBookedHours: wdB,
    weekdayAvailableHours: wdA,
    weekdayPct: pct(wdB, wdA),
    weekendBookedHours: weB,
    weekendAvailableHours: weA,
    weekendPct: pct(weB, weA),
  };
}

const KIDS = [
  "น้องข้าวหอม",
  "น้องไทม์",
  "น้องมะลิ",
  "น้องปีใหม่",
  "น้องภูผา",
  "น้องใบเตย",
  "น้องนาวา",
  "น้องพิมพ์",
  "น้องต้นกล้า",
  "น้องเอวา",
  "น้องธาม",
  "น้องมีนา",
  "น้องคิริน",
  "น้องแพรวา",
  "น้องโอบอุ้ม",
  "น้องปุณ",
];
const PACKAGES = [
  "Course 4 · Bike",
  "Course 6 · Skate",
  "Course 10 · Bike",
  "Course 10 · Surfskate",
  "Course 4 · Balance Play",
];
const VOUCHERS = ["Voucher 5 hrs", "Voucher 10 hrs", "Voucher 15 hrs"];
const REMARKS = [
  "ผู้ปกครองขอเรียนวันเสาร์",
  "สนใจคอร์สต่อหลังจบ",
  "ขอครูคนเดิม",
  null,
  null,
  null,
];

/** Detail rows for one New-vs-Renewing card — exactly `count` rows, real teacher ids, dates inside `month`. */
export function previewNvrRows(
  bucket: NvrBucket,
  count: number,
  teacherIds: string[],
  month: string,
): NvrDetailRow[] {
  const rand = seeded(`nvr-${month}-${bucket}`);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const day = (m: string) =>
    `${m}-${String(between(rand, 1, 28)).padStart(2, "0")}`;
  const [y, mo] = month.split("-").map(Number);
  const prev = `${mo === 1 ? y - 1 : y}-${String(mo === 1 ? 12 : mo - 1).padStart(2, "0")}`;
  const teacher = () => (teacherIds.length > 0 ? pick(teacherIds) : null);

  return Array.from({ length: count }, (_, i) => {
    const base = {
      studentId: `preview-${bucket}-${i}`,
      studentName: KIDS[i % KIDS.length],
      remark: pick(REMARKS),
    };
    switch (bucket) {
      case "firstTrial":
      case "trialNotConverted":
        return { ...base, trialTeacherId: teacher(), trialDate: day(month) };
      case "newCourseThisMonth": {
        const hadTrial = rand() > 0.25;
        return {
          ...base,
          packageLabel: pick(PACKAGES),
          courseTeacherId: teacher(),
          trialTeacherId: hadTrial ? teacher() : null,
          trialDate: hadTrial ? day(month) : null,
          date: day(month),
        };
      }
      case "newCoursePrevMonth":
        return {
          ...base,
          packageLabel: pick(PACKAGES),
          courseTeacherId: teacher(),
          trialTeacherId: teacher(),
          trialDate: day(prev),
          date: day(rand() > 0.5 ? prev : month),
        };
      case "renewCourse":
        return {
          ...base,
          packageLabel: pick(rand() > 0.35 ? PACKAGES : VOUCHERS),
          courseTeacherId: teacher(),
          date: day(month),
        };
      case "notRenewed":
        return {
          ...base,
          packageLabel: pick(rand() > 0.35 ? PACKAGES : VOUCHERS),
          courseTeacherId: teacher(),
          date: day(month),
        };
    }
  });
}
