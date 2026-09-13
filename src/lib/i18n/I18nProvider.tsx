"use client";

// Lightweight i18n — React context + a t() resolver over EN/TH dictionaries.
// Default language is English; the choice persists in localStorage. No routing
// or external deps (internal staff tool, two languages).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dictionaries, type Lang } from "./dictionaries";

const STORAGE_KEY = "ss.lang";
const DEFAULT_LANG: Lang = "en";

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /**
   * TASK-350 — set the language ONLY when this scope has no saved preference (a first visit). A device default
   * (the LINE app's language on `/register`) goes through here, so a choice a person made earlier always wins.
   */
  setLangIfUnset: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Resolve a dotted path ("booking.confirm") in a nested dictionary object.
function resolve(dict: Record<string, unknown>, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, dict);
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    name in vars ? String(vars[name]) : m,
  );
}

/**
 * `storageKey` (TASK-350) — a nested provider with its own key gives a subtree its own saved preference.
 * `localStorage` is per ORIGIN, so without it a parent's toggle on `/register` and an admin's choice in the
 * back office would be the same `ss.lang` on the same browser; `/register` mounts one with `ss.lang.register`.
 */
export function I18nProvider({ children, storageKey = STORAGE_KEY }: { children: React.ReactNode; storageKey?: string }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  // Read the saved choice on mount (client only).
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "en" || saved === "th") setLangState(saved);
  }, [storageKey]);

  // Keep <html lang> in sync for a11y / correct font shaping.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      window.localStorage.setItem(storageKey, next);
    },
    [storageKey],
  );

  // Reads storage at CALL time, not mount time: the caller (LIFF init) answers well after the first render.
  const setLangIfUnset = useCallback(
    (next: Lang) => {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "en" || saved === "th") return;
      setLangState(next);
    },
    [storageKey],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const hit = resolve(dictionaries[lang], key) ?? resolve(dictionaries.en, key);
      return interpolate(hit ?? key, vars);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, setLangIfUnset, t }), [lang, setLang, setLangIfUnset, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

/** Shorthand for the common case — just the translate function. */
export function useT() {
  return useI18n().t;
}
