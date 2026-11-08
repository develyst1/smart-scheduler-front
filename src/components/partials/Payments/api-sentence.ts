/**
 * The API's own sentence for a refused call (e.g. "the installments add up to more than the course fee"), or null for a
 * transport failure (no answer from the server, where the screen shows its own generic line).
 *
 * Duck-typed on purpose: an `ApiClientError` is an `Error` with a numeric `status`. Checking `instanceof` would tie this to
 * one class object, and bun's `mock.module` swaps that module process-wide, so the same code would behave differently
 * depending on which test file ran before it.
 */
export function apiSentence(e: unknown): string | null {
  const x = e as { message?: unknown; status?: unknown } | null;
  return x && typeof x.message === "string" && x.message !== "" && typeof x.status === "number" ? x.message : null;
}
