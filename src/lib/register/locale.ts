import type { Lang } from "@/lib/i18n";
import { loadLiff } from "./liff";

/**
 * TASK-350 (`REQ-088 §8`) — **the LINE app's language, as a DEFAULT for a first visit.** This is the one thing
 * `/register` reads from LIFF that is not the credential, and it lives here so `liff.ts` keeps doing one job.
 *
 * `liff.getLanguage()` is valid after `liff.init` — which `obtainIdToken` has already done by the time the page
 * asks — and returns a BCP-47 tag (`th`, `th-TH`, `en-US`, `ja`…). Thai ⇒ `th`; anything else ⇒ `en`, because
 * those are the two languages the dictionary has. 🚫 Nothing is stored by this call: the page applies it through
 * `setLangIfUnset`, so a preference a parent saved earlier always wins.
 */
export const phoneLanguage = async (): Promise<Lang> => {
  try {
    const liff = await loadLiff();
    return /^th(|-)/i.test(liff.getLanguage() ?? "") ? "th" : "en";
  } catch {
    return "en";
  }
};
