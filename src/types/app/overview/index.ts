// Overview (Stage 2 — merges Daily report + Badge dashboard + SOM into one screen).
// One time-scope drives the whole page; the FE renders this shape as-is. Backend is the source of
// truth — this file only defines the contract the API should fill. See src/hooks/scheduler/useOverview.ts
// for the placeholder generator that lets the UI render before the endpoint exists.

import type { BookingType, TeacherType } from "@/types/app/scheduler";
import type { Breakdown, BreakdownBucket } from "@/types/app/som";

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

/**
 * Registration type = how a customer is enrolled. These ARE the four BookingTypes:
 *   COURSE_PACKAGE = คอร์ส (comes in 4/6/10 sizes — see CourseSizeSlice)
 *   VOUCHER        = voucher (count only the not-yet-expired ones)
 *   FIRST_TRIAL    = trial (count only those within the last 3 months)
 *   SINGLE_SESSION = จองรายครั้ง
 * 4/6/10 is NOT a separate axis — it is a sub-split of the course type.
 */
export interface RegistrationTypeCount {
  type: BookingType;
  count: number;
}

/** Active courses split by package size (4/6/10). */
export interface CourseSizeSlice {
  size: number; // 4 | 6 | 10
  count: number;
}

/**
 * EXISTING COURSE (SOM timeline). Counts of ACTIVE (not-expired) ENTITLEMENTS, not distinct customers:
 *   - activeCourse : # active courses (all not-expired, even ones with no schedule)
 *   - activeVoucher: # active (not-expired) vouchers
 *   - total        : activeCourse + activeVoucher
 *   - previous3M   : customers who studied within the last 3 months but are NOT active now
 *                    (win-back / "potential bring back") — this is a headcount, not an entitlement.
 */
export interface ExistingCustomers {
  activeCourse: number;
  activeVoucher: number;
  total: number;
  previous3M: number;
  courseSizeSplit: CourseSizeSlice[]; // active courses split by size (4/6/10)
}

/**
 * NEW VS REMAINING (SOM timeline). Three period-filterable headcounts:
 *   - newFirstTrial: brand-new walk-ins doing their first 1-hr trial
 *   - newCourse    : new customers who open a course as their very first course
 *   - renewing     : customers whose course finished and who renew into a new course
 */
export interface NewCustomers {
  newFirstTrial: number;
  newCourse: number;
  renewing: number;
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

/**
 * SOM req point 4: count of each activity within each registration type — a type × activity matrix.
 * (Owner's wording "จำนวนเฉลี่ย" read as the per-(type,activity) count, NOT a money figure.)
 */
export interface TypeActivityCount {
  type: BookingType; // course / voucher / trial / single-session
  byActivity: BreakdownBucket[]; // one bucket per activity, with its count
}

/** Zone 3 · Business — customer base, acquisition, market share & demographics. */
export interface BusinessSection {
  existingCustomers: ExistingCustomers;
  newCustomers: NewCustomers;
  activityShare: Breakdown; // existing base split by activity (bike / scooter / surfskate / skate)
  typeActivityMatrix: TypeActivityCount[]; // req 4: activity counts per registration type
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
