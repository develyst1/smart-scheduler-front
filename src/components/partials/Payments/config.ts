/**
 * TASK-876 SHIP GATE (Sector, 2026-11-08). `false` ⇒ the Payment feature is INERT in the tree: `PaymentCard` renders nothing and
 * makes no call, the sale form shows no Payment Method select and makes no follow-up call. The routes (`/payments`, TASK-875)
 * do not exist on sid yet; flip this to `true` in one line AFTER TASK-875 is on sid.
 */
export const PAYMENTS_LIVE = true;

/**
 * TASK-876: dev-only fake for the payment API (SPEC-099 §8.5 + §8.9), used until TASK-875's routes exist.
 * Must stay `false` in delivered code. Flip it locally to see the screens without the back end; never an env key.
 */
export const USE_FAKE_PAYMENTS = false;
