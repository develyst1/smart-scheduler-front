// REQ-132 (TASK-841) — an Attention item that names a course or a voucher links to THAT entitlement: the Bookings page opens its plan window ("จัดการแผน").
// ONE place builds the URL and ONE place reads it, so the two cannot drift apart.

/** What the server sends on an item of "ใกล้ใช้ครบ" / "ใกล้หมดอายุ" (other checks carry no `link`). */
export interface AttentionLink {
  kind: "course" | "voucher";
  id: string;
}

/**
 * 🔴 TASK-960 (SPEC-105 §3) — an item of "คลาสในวันปิดทำการ" names a DATE, not a plan: it opens the calendar on that day. A second shape beside the plan link (kept separate so the plan
 * window's reader, which needs an `id`, is untouched).
 */
export interface AttentionDayLink {
  kind: "day";
  date: string;
}

/** `/scheduler/bookings?course=<id>` (or `?voucher=<id>`) — the id is the server's, encoded; nothing else rides the URL. A day link is `/scheduler/calendar?date=YYYY-MM-DD`. */
export const attentionHref = (link: AttentionLink | AttentionDayLink): string =>
  link.kind === "day"
    ? `/scheduler/calendar?date=${encodeURIComponent(link.date)}`
    : `/scheduler/bookings?${link.kind === "voucher" ? "voucher" : "course"}=${encodeURIComponent(link.id)}`;

/** The calendar's ONLY URL read: the day a link asks for, or null. Only a real `YYYY-MM-DD` counts (anything else is ignored, so a hand-typed URL cannot put the grid on a bad date). */
export const dayRequestFromParams = (get: (key: string) => string | null): string | null => {
  const d = get("date");
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d) ? d : null;
};

/** The Bookings page's ONLY URL read: which entitlement a link asks to open. `course` wins if both are present. Any other key is ignored. */
export const planRequestFromParams = (get: (key: string) => string | null): AttentionLink | null => {
  const course = get("course");
  if (course) return { kind: "course", id: course };
  const voucher = get("voucher");
  if (voucher) return { kind: "voucher", id: voucher };
  return null;
};
