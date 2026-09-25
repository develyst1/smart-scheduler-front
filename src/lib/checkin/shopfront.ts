/**
 * REQ-108 (TASK-475/478) — the SHOP-FRONT check-in: a family at the counter types the phone number, picks the child's
 * class, and is checked in. No login, **no token**.
 *
 * 🔴 **`/checkin/shop` IS FROZEN. Khwan is printing it on a poster.**
 * A paper QR cannot be rotated, re-issued or redirected: once the poster is on the wall, every visitor who scans it
 * for the next year hits this exact path. So it is not a route to tidy, rename, nest or "clean up with the others" —
 * the URL is a physical object now. `SHOPFRONT_PATH` is the one place it is written, a test pins that the page at that
 * path exists, and this paragraph is why. If a future task needs a different flow, it adds a path; this one stays.
 *
 * 🚫 **No token, ever** (the owner's ruling, REQ-108 §5): the phone IS the credential. A token would expire, and an
 * expired token on a printed poster is a dead poster.
 * 🚫 **Nothing is stored** — it is a shared device on a counter. No autofill of the last number, no `localStorage`; the
 * field is cleared after a success so the next family never sees the previous one's screen.
 */

/** 🔴 PRINTED ON A POSTER — see the file header before touching this. */
export const SHOPFRONT_PATH = "/checkin/shop";

/**
 * The poster's URL, built from the SAME env value the backend's `PUBLIC_CHECKIN_BASE_URL` points at
 * (`NEXT_PUBLIC_API_URL`, minus its `/api`) — never a second literal, or the day the host moves the QR panel and the
 * backend disagree and the poster is wrong.
 */
export const shopfrontUrl = (apiUrl: string | undefined): string => {
  const origin = (apiUrl ?? "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
  return `${origin}${SHOPFRONT_PATH}`;
};

/** What the lookup answers, per child. The server sends ONLY what can be checked in right now. */
export type ShopfrontItem =
  | { kind: "session"; bookingId: string; date: string; startTime: string; endTime: string; program: string; teacher: string }
  | { kind: "camp"; campDayId: string; date: string; half: "AM" | "PM" | "FULL" };
export interface ShopfrontChild {
  name: string;
  items: ShopfrontItem[];
}
export interface ShopfrontLookup {
  children?: ShopfrontChild[] | null;
}

/**
 * 🔴 **The guard of this whole page.** An unknown number, a family with nothing right now, and a suspended household
 * are made INDISTINGUISHABLE by the server — one shape, one timing. This is the client half of that promise: every one
 * of them lands here as `true`, so the screen shows ONE neutral sentence, no names, and behaves the same (no retry
 * that fires in only one case, no second message for "absent" versus "empty"). A child with an empty list is nothing
 * to offer either — it must not read as "we know this family, they just have no class".
 */
export const isNothingToOffer = (data: ShopfrontLookup | null | undefined): boolean =>
  !data?.children || data.children.length === 0 || data.children.every((c) => (c.items ?? []).length === 0);

/**
 * The rows to offer, flattened with their child's name. 📌 It does NOT re-ask `isNothingToOffer`: a second guard here
 * could never change a result (an empty list flattens to nothing anyway), and a guard no test can hold is a comment
 * pretending to be code — ONE place decides emptiness, and the page branches on it.
 */
export const offerRows = (data: ShopfrontLookup | null | undefined): Array<{ child: string; item: ShopfrontItem }> =>
  (data?.children ?? []).flatMap((c) => (c.items ?? []).map((item) => ({ child: c.name, item })));

/** A row's own id — the one the check-in call carries. */
export const itemKey = (item: ShopfrontItem): string => (item.kind === "camp" ? item.campDayId : item.bookingId);

/**
 * `POST /api/checkin/shopfront` — the phone rides AGAIN (the server keeps no state between the two calls) and exactly
 * ONE of the two ids, by kind. 🚫 Never both, never neither.
 */
export const checkinBody = (phone: string, item: ShopfrontItem): { phone: string; bookingId?: string; campDayId?: string } =>
  item.kind === "camp" ? { phone: phone.trim(), campDayId: item.campDayId } : { phone: phone.trim(), bookingId: item.bookingId };

/**
 * The submit is offered on a non-empty number and nothing more: whether it is phone-SHAPED is the server's `400`, and a
 * client format rule would be a second opinion that can disagree (and would leak "this looks like a real number").
 */
export const canLookup = (phone: string): boolean => phone.trim().length > 0;
