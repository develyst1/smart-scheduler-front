import type { TeacherType } from "@/types/app/scheduler";

// SOM dashboard (REQ-013 / SPEC-020). One snapshot from GET /api/reports/som; the FE renders it as-is —
// no recomputation, no re-bucketing, no age derivation (all server-side so every surface agrees).

/** The page's time period (client, 2026-11): everything, one month, or a custom date range. */
export type SomPeriod =
  | { kind: "all" }
  | { kind: "month"; month: string } // YYYY-MM
  | { kind: "range"; from: string; to: string }; // YYYY-MM-DD, inclusive

/** Page-level filters: one period + badge (branch) values, applied to every section but Today. */
export interface SomQuery {
  period: SomPeriod;
  /** Empty = all branches. */
  badgeValueIds: string[];
}

/** The period a section says it covers. `month` is null unless a month was selected. */
export interface SomPeriodEcho {
  month?: string | null; // YYYY-MM
  from?: string | null; // YYYY-MM-DD
  to?: string | null; // YYYY-MM-DD
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

export interface ExistingCustomers extends SomPeriodEcho {
  byCourse: number;
  byVoucher: number;
  byRecentTrial: number;
  total: number;
  recentTrialSince: string; // YYYY-MM-DD
  // ── New contract (docs/backend-som-dashboard.md §2). The legacy fields above keep their old (buggy) values on
  // the server so nothing else breaks — the screen reads these whenever they are present.
  activeCourse?: number;
  activeVoucher?: number;
  recentFirstTrial?: number;
  recentSingleSession?: number;
  totalCustomers?: number;
  recentFrom?: string | null; // YYYY-MM
  recentTo?: string | null; // YYYY-MM
}

export interface NewVsRenewing extends SomPeriodEcho {
  newByFirstTrial: number;
  newByRegistration: number;
  renewing: number;
  // ── New contract (docs/backend-som-dashboard.md §3). Legacy `newByFirstTrial` / `renewing` stay buggy on the
  // server (Renew is always 0) — the screen reads these whenever they are present.
  firstTrial?: number;
  renewCourse?: number;
  newCourseThisMonth?: number;
  newCoursePrevMonth?: number;
  trialNotConverted?: number;
  notRenewed?: number;
}

/** The six New-vs-Renewing cards, in screen order — each opens a detail table (GET /reports/som/new-vs-renewing/:bucket). */
export const NVR_BUCKETS = [
  "firstTrial",
  "newCourseThisMonth",
  "trialNotConverted",
  "renewCourse",
  "notRenewed",
  "newCoursePrevMonth",
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

/** Hours + weekday/weekend split for one coach or one coach type, over the section's period. */
export interface CapacityFigures {
  /** Hours actually booked/taught in the period (weekday + weekend). */
  bookedHours: number;
  /** Hours the coach(es) could teach in the period (their working days × 9 slots). Freelance = 0: they have no fixed
   *  hours, so the screen shows taught hours only. */
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

export interface CoachCapacity extends SomPeriodEcho {
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

export interface ActivityProgram extends SomPeriodEcho {
  categories: ActivityCategory[];
}

/** Who a demographics / activity count covers. The only value so far: active course or voucher holders at the
 *  range end + the "1 HR (last 3 months)" children, each child once (backend spec 2026-11-11). */
export type SomBase = "CUSTOMERS_PLUS_RECENT_1HR";

/** One slice of an activity's pie: active COURSES of one size (a child with two courses counts two), or the
 *  CHILDREN with a 1 HR of that activity in the last-3-months window. Vouchers are never counted. */
export type ActivityPackage =
  | { kind: "COURSE"; size: number; count: number }
  | { kind: "SINGLE_SESSION"; count: number };

export interface ActivityPackageGroup {
  key: string;
  /** Display name, e.g. "Private SURFSKATE"; `unknown` is labelled FE-side. */
  label?: string | null;
  /** Sum of `packages[].count` — `firstTrial` is NOT part of it. */
  total: number;
  /** Largest count first. */
  packages: ActivityPackage[];
  /** 1st Trials of this activity in the range, shown on their own. */
  firstTrial: number;
}

/** The activity chart (backend spec 2026-11-11): every active activity, 0 included, so colours stay stable. */
export interface ActivityPackages extends SomPeriodEcho {
  base?: SomBase | null;
  activities: ActivityPackageGroup[];
}

export interface TodaySection {
  date: string; // YYYY-MM-DD
  /** Legacy — superseded by `confirmed` (kept by the server so older screens don't break). */
  expected: number;
  attended: number;
  /** New contract (docs/backend-som-dashboard.md §1): CONFIRMED + ATTENDED today. */
  confirmed?: number;
  /** attended ÷ confirmed × 100, rounded; 0 when nothing is confirmed. */
  attendanceRate?: number;
}

export interface SomReport {
  existingCustomers: ExistingCustomers;
  sportShare: Breakdown;
  newVsRenewing: NewVsRenewing;
  demographics: SomPeriodEcho & {
    /** Who the breakdowns count — drives the "based on X of Y …" line. Absent = attended students (older servers). */
    base?: SomBase | null;
    gender: Breakdown;
    ageBand: Breakdown;
    province: Breakdown;
    /** Bucket `label` = "District, Province". */
    district?: Breakdown;
    /** แขวง/ตำบล per district, keyed by the district row's `key` (same people + filters as `district`). A district
     *  missing here has no data. Each total = that district's count in `district`. */
    subdistrictByDistrict?: Record<string, Breakdown>;
    nationality: Breakdown;
  };
  today: TodaySection;
  /** Absent / null → the section renders its columns with "—". */
  coachCapacity?: CoachCapacity;
  /** Absent / null → "No data yet" (never the legacy `sportShare`). Shown only until `activityPackages` ships. */
  activityProgram?: ActivityProgram;
  /** The new activity chart. When present it replaces the Activity / Program section. */
  activityPackages?: ActivityPackages | null;
  generatedAt: string; // ISO
}
