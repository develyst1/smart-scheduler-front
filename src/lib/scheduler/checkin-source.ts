/**
 * REQ-108 / TASK-481/482/527 — **who checked this session in**, as the one place the provenance becomes a chip.
 *
 * 🔴 **TASK-527: this now reads `checkinChannel` (the closed set), not the deprecated `checkinSource`.** The old column is
 * to be dropped; this chip was its LAST reader, and a drop while it read it would have silenced the chip **without
 * failing a test on either side** — the drop is a BE task, the chip is an FE file, and neither repo objects. The chip is
 * the only evidence an unlinked family will ever have that a wall-QR check-in happened (REQ-108 §5, the gap the owner
 * accepted), so that silence would have been invisible and expensive.
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

import type { CheckinChannel } from "@/types/api/contract";

/** The one CHANNEL with words: a family scanned the poster's QR at the counter. */
export const SHOPFRONT_CHANNEL: CheckinChannel = "shopfront-qr";

/**
 * channel → copy key. ONE entry; the next channel that earns words has one obvious place to be named.
 * 📌 Still a **null-prototype** map read through `Object.hasOwn`, and TASK-527 did NOT relax that even though
 * `checkinChannel` is a closed set: the guard cost nothing, and the map is now one `as unknown as` away from being fed
 * free text again if a later task widens the field. **A map whose keys come from outside stays a null-prototype map.**
 * (The original reason, worth keeping: on a plain object `checkinSourceLabelKey("toString")` returned
 * `Object.prototype.toString` — a FUNCTION handed to the chip to render in front of a customer.)
 */
export const CHECKIN_CHANNEL_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), { [SHOPFRONT_CHANNEL]: "checkinSource.shopfrontQr" }),
);

/**
 * The chip's copy key for a CHANNEL, or `null` for "render nothing" — `null`, `undefined`, the other four channels, and
 * any value a later task invents. 🚫 It is never given `checkinActor`: that is a person's username, and TASK-488 exists
 * to keep the two apart.
 */
export const checkinChannelLabelKey = (channel: string | null | undefined): string | null =>
  typeof channel === "string" && Object.hasOwn(CHECKIN_CHANNEL_LABELS, channel) ? CHECKIN_CHANNEL_LABELS[channel] : null;
