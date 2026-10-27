// REQ-132 (TASK-841) — an Attention item that names a course or a voucher links to THAT entitlement: the Bookings page opens its plan window ("จัดการแผน").
// ONE place builds the URL and ONE place reads it, so the two cannot drift apart.

/** What the server sends on an item of "ใกล้ใช้ครบ" / "ใกล้หมดอายุ" (other checks carry no `link`). */
export interface AttentionLink {
  kind: "course" | "voucher";
  id: string;
}

/** `/scheduler/bookings?course=<id>` (or `?voucher=<id>`) — the id is the server's, encoded; nothing else rides the URL. */
export const attentionHref = (link: AttentionLink): string =>
  `/scheduler/bookings?${link.kind === "voucher" ? "voucher" : "course"}=${encodeURIComponent(link.id)}`;

/** The Bookings page's ONLY URL read: which entitlement a link asks to open. `course` wins if both are present. Any other key is ignored. */
export const planRequestFromParams = (get: (key: string) => string | null): AttentionLink | null => {
  const course = get("course");
  if (course) return { kind: "course", id: course };
  const voucher = get("voucher");
  if (voucher) return { kind: "voucher", id: voucher };
  return null;
};
