// Overview (Stage 2 — merges Daily report + Badge dashboard + SOM into one screen).
// One time-scope drives the whole page; the FE renders this shape as-is. Backend is the source of
// truth — this file only defines the contract the API should fill. See src/hooks/scheduler/useOverview.ts
// for the placeholder generator that lets the UI render before the endpoint exists.

import type { BookingType, TeacherType } from "@/types/app/scheduler";
import type { Breakdown } from "@/types/app/som";

export type ScopePreset = "today" | "week" | "month" | "custom";

export interface OverviewScope {
  preset: ScopePreset;
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
}

/** One day of the scope — powers the trend area chart and the KPI sparklines. */
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  booked: number;
  attended: number;
}

/** Zone 1 · Pulse — operational snapshot for the selected scope. */
export interface PulseSection {
  totalBooked: number; // excludes cancelled / waiting-slot
  attended: number;
  confirmed: number;
  pending: number;
  onLeave: number;
  cancelled: number;
  attendanceRate: number; // 0–100
  trend: TrendPoint[];
}

export interface TeacherWorkload {
  teacherId: string;
  nickname: string;
  type: TeacherType;
  count: number;
  attended: number;
}

export interface BadgeSlice {
  valueId: string;
  label: string;
  color: string; // Mantine palette key
  count: number;
}

/** Zone 2 · Operations — how the load splits across teachers, booking types, badges. */
export interface OperationsSection {
  byTeacher: TeacherWorkload[]; // sorted desc by count
  byBookingType: { type: BookingType; count: number }[];
  byBadge: BadgeSlice[];
}

export interface ExistingCustomers {
  byCourse: number;
  byVoucher: number;
  byRecentTrial: number;
  total: number;
}

/**
 * New-customer funnel for the month (SOM req: "เดือนนี้มีลูกค้าใหม่กี่คน > register และ สมัครใหม่เลย
 * > ต่อ course กี่คน > เป็นกิจกรรมอะไร"). Acquisition split → conversion to a paid course.
 * NOTE: "ต่อ course" here = convert / buy a course (confirmed), NOT renewing an existing one.
 */
export interface NewCustomerFunnel {
  total: number; // new customers this month
  viaRegister: number; // acquired via registration (e.g. after a trial)
  viaDirectSignup: number; // "สมัครใหม่เลย" — signed up directly
  convertedToCourse: number; // of the new customers, how many bought a course
}

/** Active course customers split by package size (SOM req: "course กี่ชม 4/6/10"). */
export interface CourseSizeSlice {
  size: number; // 4 | 6 | 10
  count: number;
}

/** One activity's money figures (SOM req: sales & avg-per-course "แต่ละกิจกรรม"). */
export interface ActivityRevenue {
  key: string;
  label: string;
  revenue: number; // THB in the scope
  avgPerCourse: number; // THB, average course value for this activity
}

/** A sellable category's takings (SOM req: "ยอดขายแบ่งเป็นแต่ละ category"). */
export interface CategoryRevenue {
  key: string;
  label: string;
  revenue: number; // THB
}

/** Per-customer history row (SOM req: "ลูกค้าแต่ละคนต่อคอร์สมาแล้วกี่ครั้ง spend เท่าไหร่"). */
export interface CustomerSpend {
  id: string;
  name: string;
  activity: string; // primary activity label
  courses: number; // courses taken
  visits: number; // sessions attended
  spend: number; // total THB with us
}

/** Zone 4 · Revenue & value — money view (all THB, backend is source of truth). */
export interface RevenueSection {
  total: number; // total sales in the scope, THB
  byCategory: CategoryRevenue[];
  byActivity: ActivityRevenue[]; // carries revenue + avgPerCourse per activity
  topCustomers: CustomerSpend[]; // sorted desc by spend
}

/** Zone 3 · Business — customer base, acquisition, market share & demographics. */
export interface BusinessSection {
  existingCustomers: ExistingCustomers;
  courseSizeSplit: CourseSizeSlice[];
  newCustomers: NewCustomerFunnel;
  newCourseByActivity: Breakdown; // activity of the courses new customers converted to
  activityShare: Breakdown; // existing base split by activity (bike / scooter / surfskate / skate)
  demographics: {
    gender: Breakdown;
    ageBand: Breakdown;
    province: Breakdown;
    nationality: Breakdown;
  };
}

export interface OverviewData {
  scope: OverviewScope;
  pulse: PulseSection;
  operations: OperationsSection;
  business: BusinessSection;
  revenue: RevenueSection;
  generatedAt: string; // ISO
}
