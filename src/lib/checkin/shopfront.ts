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

// ──────────── REQ-108 (TASK-490/491) — several children, one press, A RESULT PER CHILD ────────────

/** The server's ceiling, surfaced kindly BEFORE the request rather than as a refusal after it. */
export const MAX_BATCH = 10;

/** `POST /api/checkin/shopfront/batch` — the phone again, then the ticked items in the order shown. */
export const batchBody = (phone: string, items: readonly ShopfrontItem[]) => ({
  phone: phone.trim(),
  items: items.map((item) => (item.kind === "camp" ? { campDayId: item.campDayId } : { bookingId: item.bookingId })),
});

/** 1 to `MAX_BATCH` ticked. Zero has nothing to ask; over the ceiling is refused before the request (see `overMax`). */
export const canSubmitBatch = (ticked: number): boolean => ticked >= 1 && ticked <= MAX_BATCH;
export const overMax = (ticked: number): boolean => ticked > MAX_BATCH;

/** One row of the batch answer: the item asked, the status the SINGLE route would have given, and that route's body. */
export interface BatchRow {
  bookingId?: string;
  campDayId?: string;
  status: number;
  body?: unknown;
}

/**
 * 🔴 **The rule this whole feature turns on.** The request's `200` means *the list was read* — it says nothing about any
 * child. Each row is decided from **its own `status`**, exactly as the single route's answer would have been:
 * `done` (checked in) · `already` (it was already done — still in the class) · `refused` (it did not happen).
 *
 * 🚫 Never from the HTTP status of the batch, and never optimistically: three ticked with one refused must not read as
 * "checked in", because a parent told that walks away believing all three children are in — and the refused child is
 * then not expected in the class with nobody looking for them.
 */
export type RowOutcome = "done" | "already" | "refused";
export const rowOutcome = (row: Pick<BatchRow, "status" | "body">): RowOutcome => {
  if (row.status < 200 || row.status > 299) return "refused";
  const body = row.body as { already?: boolean; day?: { status?: string } } | null | undefined;
  // A camp day the coach marked ABSENT comes back 2xx with the day as it stands (TASK-480/483) — it is NOT a check-in.
  if (body?.day?.status === "ABSENT") return "refused";
  return body?.already === true ? "already" : "done";
};

/** The refused row's OWN sentence, as the server wrote it; never a client explanation of someone else's refusal. */
export const rowReason = (row: Pick<BatchRow, "body">): string | null => {
  const body = row.body as { error?: { message?: string } } | null | undefined;
  const message = body?.error?.message;
  return typeof message === "string" && message.trim() ? message : null;
};

/**
 * The counts for a line that may be shown **in addition to** the per-child rows, never instead of them.
 * `anyRefused` is what forbids every overall-success word on the screen.
 */
export const batchSummary = (rows: readonly Pick<BatchRow, "status" | "body">[]) => {
  const outcomes = rows.map(rowOutcome);
  const refused = outcomes.filter((o) => o === "refused").length;
  return {
    total: outcomes.length,
    in: outcomes.filter((o) => o === "done" || o === "already").length,
    refused,
    anyRefused: refused > 0,
    allIn: outcomes.length > 0 && refused === 0,
  };
};

/**
 * The headline for a batch result. 🔴 **A success word only when EVERY child is in**; one refusal and the headline is
 * neutral and says how many need attention — the parent must be able to tell at a glance which children are in.
 */
export const batchHeadlineKey = (rows: readonly Pick<BatchRow, "status" | "body">[]): string => {
  const s = batchSummary(rows);
  if (s.total === 0) return "shopCheckin.tryAgain";
  return s.allIn ? "shopCheckin.batchAllIn" : "shopCheckin.batchMixed";
};

/** Pair each answer row back to the item it was asked for — by id, not by position, so a reorder cannot mislabel a child. */
export const pairRows = <T extends { item: ShopfrontItem; child: string }>(asked: readonly T[], rows: readonly BatchRow[]): Array<T & { row: BatchRow | null }> =>
  asked.map((a) => ({ ...a, row: rows.find((r) => (r.campDayId ?? r.bookingId) === itemKey(a.item)) ?? null }));
