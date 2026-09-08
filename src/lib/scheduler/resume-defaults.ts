import dayjs from "dayjs";

/**
 * TASK-288 §1 — **what the resume form opens on.**
 *
 * 🔴 The defect these exist to prevent: the re-plan form reused the CREATION form's defaults (`10:00`,
 * `today + 7`), so **a 17:00 course was resumed on them and every session came back at 10:00** — the family's
 * lesson moved, silently, on the path an admin actually takes. Those defaults are right for creation, where
 * there is no course yet; they are wrong for a re-plan, where the course already has a slot.
 *
 * 📌 And a form that asks with the wrong answer pre-filled produces the same screenshot as a bug that never
 * asked — which is why this looked like DEF-2 had survived.
 *
 * They live here rather than inline in the dialog for the reason TASK-147 and TASK-237 both landed on: **a rule
 * that only exists in a component cannot be tested**, and "a 17:00 course defaults to 17:00" is the assertion
 * this task is actually made of.
 */

/** The creation form's defaults, kept as the fallback for a course whose own slot cannot be read. */
export const FALLBACK_TIME = "10:00";
export const FALLBACK_LEAD_DAYS = 7;

/** The time the re-plan opens on: the course's own, whenever we have it. */
export const resumeDefaultTime = (courseStartTime: string | null | undefined): string =>
  courseStartTime || FALLBACK_TIME;

/**
 * The date the re-plan opens on: the first `weekday` on or after `today + 7`.
 *
 * 📌 **The DATE is a genuine choice and this is only a default** — the old dates are behind us, or nobody would
 * be re-planning. Landing it on the course's own weekday makes *"the same slot, a couple of weeks later"* one
 * click, and moving the lesson a deliberate act rather than an accident of the form.
 */
export const defaultResumeDate = (weekday: number | null | undefined): string => {
  const earliest = dayjs().add(FALLBACK_LEAD_DAYS, "day");
  if (weekday == null) return earliest.format("YYYY-MM-DD");
  return earliest.add((weekday - earliest.day() + 7) % 7, "day").format("YYYY-MM-DD");
};
