/**
 * REQ-108 / TASK-481/482 — **who checked this session in**, as the one place a source becomes a chip.
 *
 * 🔴 Why this exists at all: the owner accepted a gap in REQ-108 — **a family with no linked LINE gets no notice when
 * someone checks their child in.** For that family this chip is the ENTIRE safety net: the only way anyone can later
 * tell that a check-in came from the wall QR rather than from a member of staff who looked at the person in front of
 * them. It is read *after* something has gone wrong, by an admin scanning a roster for the odd row — so it must be
 * quiet (most shop-QR check-ins are ordinary) and still impossible to slide past.
 *
 * 🔑 **`shopfront-qr` is the only value with a chip.** `checkin-qr`, `end-of-day` and `null` render nothing — and so
 * does anything else, because the value is **open-ended**: for a staff check-in the server sends an ADMIN'S USERNAME,
 * not a word from a list. A map, not a switch, is the shape that makes that safe: an unrecognised value simply has no
 * entry, so it renders nothing and throws nothing. A box reading `undefined` in front of a customer is worse than no
 * box, and a chip on every row is a chip nobody reads — the one we care about would vanish into it.
 *
 * 🚫 The `null` for a linked-teacher account is the SERVER's decision (TASK-481) and is not re-implemented here: if a
 * coach ever sees a chip, that is a BE defect to report, not something to patch in a view.
 */

/** The value the shop-front QR page's check-ins carry. The one source with words. */
export const SHOPFRONT_SOURCE = "shopfront-qr";

/**
 * source → copy key. ONE entry today; the next source we invent has one obvious place to be named.
 * 📌 A **null-prototype** map, and the lookup asks `Object.hasOwn`: the value is an ADMIN USERNAME on a staff
 * check-in, so it is attacker-adjacent free text reaching a map key. A plain object answers `toString` and
 * `constructor` with inherited members — my own test caught `checkinSourceLabelKey("toString")` handing a FUNCTION to
 * the chip, which would have rendered garbage in front of a customer. Own keys only.
 */
export const CHECKIN_SOURCE_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), { [SHOPFRONT_SOURCE]: "checkinSource.shopfrontQr" }),
);

/**
 * The chip's copy key for a source, or `null` for "render nothing" — which covers `null`, `undefined`, the other known
 * sources and any value we have never seen (an admin username, a source added by a later BE task).
 */
export const checkinSourceLabelKey = (source: string | null | undefined): string | null =>
  typeof source === "string" && Object.hasOwn(CHECKIN_SOURCE_LABELS, source) ? CHECKIN_SOURCE_LABELS[source] : null;
