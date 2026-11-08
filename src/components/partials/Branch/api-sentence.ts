/**
 * The API's own sentence for a refused call, or null for a transport failure. Duck-typed on purpose (an `ApiClientError` is an `Error`
 * with a numeric `status`): `instanceof` would tie this to one class object, and bun's `mock.module` swaps that module process-wide.
 */
export function apiSentence(e: unknown): string | null {
  const x = e as { message?: unknown; status?: unknown } | null;
  return x && typeof x.message === "string" && x.message !== "" && typeof x.status === "number" ? x.message : null;
}
