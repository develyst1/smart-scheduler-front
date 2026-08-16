import type { CourseContext, EligibleStudent, VoucherContext } from "@/types/app/scheduler";

/** The two booking types that pick an existing entitlement instead of a free student. */
export type EligibleType = "COURSE_PACKAGE" | "VOUCHER";

/**
 * The option identity for an eligible row is the **entitlement**, not the student:
 * one student holding two courses is two rows (REQ-029 / SPEC-039 AC-3).
 */
export const entKey = (e: EligibleStudent, type: EligibleType) =>
  type === "COURSE_PACKAGE"
    ? (e.context as CourseContext).courseId
    : (e.context as VoucherContext).voucherId;

/**
 * TASK-121 — a student with 2+ active courses would otherwise show identical name-only rows; enrich the
 * COURSE label with subject + used/size so the row is pickable without guessing. Voucher rows stay name-only.
 * TASK-125 (OBS-5) — when the SAME student has 2+ course entries, also append the expiry so two packages identical
 * in subject+size+progress are still distinguishable (single-course labels stay clean). expiryDate is already in
 * context (no BE). A truly fungible pair (same package, same day → same expiry) stays identical — accepted residual;
 * no courseId fragment (user-hostile).
 *
 * `all` is the full eligible list the row came from — it is what tells us the student is multi-course.
 */
export const eligibleLabel = (e: EligibleStudent, type: EligibleType, all: EligibleStudent[]) => {
  const base = e.nickname || e.name;
  if (type === "COURSE_PACKAGE" && "courseId" in e.context) {
    const c = e.context;
    const subj = c.subject?.name;
    const multiCourse = all.filter((x) => x.id === e.id).length > 1;
    const expiry = multiCourse && c.expiryDate ? ` · exp ${c.expiryDate}` : "";
    return `${base}${subj ? ` · ${subj}` : ""} (${c.usedSessions}/${c.size})${expiry}`;
  }
  return base;
};
