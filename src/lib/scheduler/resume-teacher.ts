import type { TeacherView } from "@/types/app/scheduler";
import { bookableOnDate } from "./work-days";

/**
 * TASK-360 (`REQ-089 item 8`) — **pick the teacher on resume**, for BOTH doors (course re-plan, booking resume).
 *
 * The contract (TASK-359): `teacherId?` on both resume bodies. ABSENT ⇒ the server keeps today's teacher byte for
 * byte; PRESENT ⇒ that teacher on every row it writes. 🔴 **The server has NO teacher↔subject rule** — this filter
 * is the only guard, exactly as the create picker is. So it is ONE function, used by both dialogs, composed from
 * the create picker's own parts: `bookableOnDate` (the same predicate `BookingModal`'s create picker uses) and the
 * teacher's own `subjectOptions` / `subjects` (the same lists the create picker's subject dropdown is fed from).
 */
export interface ResumeSubject {
  id?: string | null;
  name?: string | null;
}

/** Does this teacher teach the subject? By id when the caller has one (a course row), else by name (a booking). */
export const teachesSubject = (tc: TeacherView, subject: ResumeSubject | null | undefined): boolean => {
  if (!subject || (!subject.id && !subject.name)) return true;
  if (subject.id && tc.subjectOptions?.length) return tc.subjectOptions.some((s) => s.id === subject.id);
  return !!subject.name && tc.subjects.includes(subject.name);
};

/**
 * The options for the resume `Select`: teachers bookable on the chosen date who teach the subject — **plus the
 * CURRENT teacher, always.** The default is "keep the teacher" (nothing sent), so the current one must be
 * pickable even if they are off that weekday or inactive today; a `Select` fed a value not in its list renders
 * blank (TASK-353's class), and blank here would read as "no teacher".
 */
export const resumeTeacherOptions = (
  teachers: TeacherView[],
  currentTeacherId: string | null | undefined,
  date: string | null | undefined,
  subject: ResumeSubject | null | undefined,
): TeacherView[] => {
  const fit = teachers.filter((tc) => (date ? bookableOnDate(tc, date) : tc.bookable) && teachesSubject(tc, subject));
  const current = currentTeacherId ? teachers.find((tc) => tc.id === currentTeacherId) : undefined;
  return current && !fit.some((tc) => tc.id === current.id) ? [current, ...fit] : fit;
};

/**
 * What goes on the wire: the picked teacher ONLY when it differs from the current one. `undefined` ⇒ the key is
 * OMITTED from the body (the services spread it conditionally), so an unchanged picker exercises the server's
 * absent path — its byte-for-byte promise — rather than re-sending the same id through the present path.
 */
export const resumeTeacherIdToSend = (
  picked: string | null | undefined,
  currentTeacherId: string | null | undefined,
): string | undefined => (picked && picked !== currentTeacherId ? picked : undefined);
