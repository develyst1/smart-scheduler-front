import type { TeacherType } from "@/types/app/scheduler";

// SOM dashboard (REQ-013 / SPEC-020). One snapshot from GET /api/reports/som; the FE renders it as-is —
// no recomputation, no re-bucketing, no age derivation (all server-side so every surface agrees).

/** Page-level filters (client, 2026-10-17): one month + badge (branch) values, applied to every section but Today. */
export interface SomQuery {
  month: string; // YYYY-MM
  /** Empty = all branches. */
  badgeValueIds: string[];
}

/** Stable key for the "unknown / ไม่ระบุ" bucket — the FE labels it from its own dictionary (API supplies identity). */
export const SOM_UNKNOWN_KEY = "unknown";

export interface BreakdownBucket {
  key: string;
  /** API label where it supplies one (e.g. a sport name); absent for keys the FE labels itself. */
  label?: string | null;
  count: number;
}

/** Every breakdown carries its own coverage so the FE can say "based on X of Y". */
export interface Breakdown {
  buckets: BreakdownBucket[];
  known: number;
  unknown: number;
  total: number;
}

export interface ExistingCustomers {
  byCourse: number;
  byVoucher: number;
  byRecentTrial: number;
  total: number;
  recentTrialSince: string; // YYYY-MM-DD
}

export interface NewVsRenewing {
  month: string; // YYYY-MM
  newByFirstTrial: number;
  newByRegistration: number;
  renewing: number;
}

/** The six New-vs-Renewing cards — each opens a detail table (GET /reports/som/new-vs-renewing/:bucket). */
export const NVR_BUCKETS = [
  "firstTrial",
  "newCourseThisMonth",
  "newCoursePrevMonth",
  "renewCourse",
  "trialNotConverted",
  "notRenewed",
] as const;
export type NvrBucket = (typeof NVR_BUCKETS)[number];

/** One row of a New-vs-Renewing detail table. Teacher NAMES are resolved FE-side from the teacher list. */
export interface NvrDetailRow {
  studentId: string;
  studentName: string;
  /** Package label from the API, e.g. "Course 10 · Bike" — absent for trial-only rows. */
  packageLabel?: string | null;
  /** Teacher of the course / voucher. */
  courseTeacherId?: string | null;
  /** Teacher who ran the student's 1st Trial. */
  trialTeacherId?: string | null;
  trialDate?: string | null; // YYYY-MM-DD
  /** The bucket's own event date: course opened · renewed · package ended. */
  date?: string | null; // YYYY-MM-DD
  /** Free-text remark shown in every detail table. */
  remark?: string | null;
}

/** Hours + weekday/weekend split for one coach or one coach type, over `CoachCapacity.month`. */
export interface CapacityFigures {
  /** Hours actually booked/taught in the month (weekday + weekend). */
  bookedHours: number;
  /** Hours the coach(es) could teach in the month (their working days × 9 slots). */
  availableHours: number;
  /** Mon–Fri: booked / available hours and booked ÷ available as 0–100 rounded (0 when nothing available). */
  weekdayBookedHours: number;
  weekdayAvailableHours: number;
  weekdayPct: number;
  /** Same on Sat–Sun. */
  weekendBookedHours: number;
  weekendAvailableHours: number;
  weekendPct: number;
}

export interface CoachCapacityPerson extends CapacityFigures {
  teacherId: string;
  teacherType: TeacherType;
}

export interface CoachCapacityType extends CapacityFigures {
  teacherType: TeacherType;
  /** How many coaches of this type are counted. */
  coaches: number;
}

export interface CoachCapacity {
  month: string; // YYYY-MM
  byPerson: CoachCapacityPerson[];
  byType: CoachCapacityType[];
}

/** One activity category (Surfskate, Inline skate, Bike, Balance Play, Other…) — active classes only. */
export interface ActivityCategory {
  key: string;
  /** API label for the category; `unknown` is labelled FE-side. */
  label?: string | null;
  course: number;
  voucher: number;
  singleSession: number;
  /** course + voucher + singleSession — feeds the Type donut. */
  typeTotal: number;
  firstTrial: number;
  total: number;
}

export interface ActivityProgram {
  categories: ActivityCategory[];
}

export interface TodaySection {
  date: string; // YYYY-MM-DD
  expected: number;
  attended: number;
}

export interface SomReport {
  existingCustomers: ExistingCustomers;
  sportShare: Breakdown;
  newVsRenewing: NewVsRenewing;
  demographics: {
    gender: Breakdown;
    ageBand: Breakdown;
    province: Breakdown;
    /** Not in the live API yet. Bucket `label` = "District, Province". */
    district?: Breakdown;
    nationality: Breakdown;
  };
  today: TodaySection;
  /** Not in the live API yet — the section renders its columns with "—" until it is. */
  coachCapacity?: CoachCapacity;
  /** Not in the live API yet — `sportShare` feeds the Total column until it is. */
  activityProgram?: ActivityProgram;
  generatedAt: string; // ISO
}
