// Display-only formatters (SPEC-037 / TASK-129, item 5). The ONE place a table turns a stored date into what the
// user reads. NEVER use these for API query ranges or DateInput/startDate VALUES — those stay ISO `YYYY-MM-DD`.
import dayjs from "dayjs";

/** A stored ISO date (`YYYY-MM-DD`) → the display format `DD/MMM/YY` (e.g. `05/Aug/26`). Empty/invalid → "". */
export const formatDateDisplay = (iso: string | null | undefined): string =>
  iso ? dayjs(iso).format("DD/MMM/YY") : "";
