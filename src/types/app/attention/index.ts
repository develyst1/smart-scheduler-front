// "Needs attention" panel (REQ-023 / SPEC-018). One producer server-side (GET /api/attention) also feeds the
// 08:00 LINE digest, so the FE never recomputes any check — it only renders the answer.

export interface AttentionItem {
  id: string;
  label: string;
  hint?: string | null;
}

export interface AttentionCheck {
  key: string;
  /** i18n key `att_<key>` — render TH+EN from the FE dictionary (not `title`, which is a TH default). */
  titleKey: string;
  title: string;
  /** number of outstanding items, or **null** = the check errored ("couldn't be checked" — not zero). */
  count: number | null;
  items: AttentionItem[];
}

export interface DigestLastRun {
  runDate: string; // YYYY-MM-DD (business date)
  finishedAt: string; // ISO timestamp
  /** true = a LINE digest was sent; false = it ran but nothing was outstanding. */
  sent: boolean;
}

export interface AttentionResponse {
  checks: AttentionCheck[];
  /** null = the 08:00 digest job has NEVER run — the scheduled task isn't set up (a visible warning, not decor). */
  lastRun: DigestLastRun | null;
}
