"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Loader, Paper, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { DatePickerInput, DatesProvider } from "@mantine/dates";
import { AlertTriangle, CheckCircle2, Link2Off, UserPlus, Users } from "lucide-react";
import { LanguageToggle, useI18n, useT } from "@/lib/i18n";
import { obtainIdToken } from "@/lib/register/liff";
import { phoneLanguage } from "@/lib/register/locale";
import {
  joinAddress,
  loadAddressBook,
  tierWordsFor,
  toCustomerDate,
  type AddressBook,
  type AreaPick,
} from "@/lib/register/entry";
import {
  create,
  link,
  lookup,
  status,
  unlink,
  type ChildRef,
  type CreateResult,
  type Refusal,
  type RegisterCode,
  type Unreachable,
} from "@/lib/register/api";

/**
 * TASK-348 (`REQ-088`) — `/register`: **registration by LINK, not by typing.** The sibling of `/checkin`:
 * public, no admin auth, direct fetch, local types.
 *
 * The customer's flow, verbatim: *tap link → allow LINE connect → enter phone → family found: tap to link /
 * none: fill NAME · DOB · ADDRESS → done.* It is the chat's screens 3–7 as ONE page — same three fields, same
 * rules, **because the page calls the SAME writer the chat calls.**
 *
 * 🔴 **RULE 1 — this page holds NO rules.** No reserved-word list, no duplicate check, no child cap, no date
 * parsing. Every one of those is a NAMED CODE from the API, rendered here as words. **The page owns WORDS. The
 * server owns DECISIONS.** The one thing this file decides is which SCREEN to show next, and even that is read
 * off the response (`children.length`, `canAddMore`, `twoFactor`) rather than derived.
 *
 * 🔑 **The ID TOKEN is the identity, on every call.** `userId` is never read and never sent.
 *
 * TASK-349 (`§7a`, `§7b`) — **every field that can be a tap is a tap, and the picker is ENTRY, not STORAGE.**
 * The date is picked year-first and the address is three cascading picks, but what leaves the page is the same
 * `DD-MM-YYYY` text and the same one-line address the chat stores. Each picker has a `พิมพ์เอง / Type it
 * instead` toggle to the plain field — a picker that cannot be bypassed on an old phone is the `สมัคร`
 * problem again. The pickers cannot produce nonsense; they do not pre-validate anything.
 *
 * TASK-350 (`§8`) — **ONE language at a time, a prominent TH/EN toggle ABOVE the first field.** A chat bubble can
 * be tall; a form that doubles every label doubles the page. The toggle is the app's own `LanguageToggle` over the
 * app's own dictionary (`th: typeof en`) — it calls `setLang` and nothing else; no field, pick or draft changes
 * with it. Default on a FIRST visit = the LINE app's language (`locale.ts`); a saved choice always wins.
 *
 * TASK-355 (`§10`) — (1) the document title is `SOM SCHEDULE` (page.tsx); (2) in EN mode the address OPTIONS show
 * the dataset's English names — DISPLAY only: the join, the sent strings and the confirm line stay Thai, because
 * that is what is stored; (3) a LINKED account is TOLD on open (`/status`, the server's masked phone, a count, no
 * names) and offered UNLINK — a destructive act that clears the FAMILY's LINE connection, every account, so it is
 * two taps and reads as the family's, not "my phone".
 */

type Phase =
  | { kind: "liff" }
  | { kind: "liff-missing" }
  | { kind: "liff-login" }
  | { kind: "liff-failed"; detail: string }
  | { kind: "phone"; unlinked?: boolean }
  /** §10.3 — the server said this account is bound: the MASKED phone and a count, as sent. `confirming` = second tap. */
  | { kind: "already-linked"; phone: string; childCount: number; canAddMore: boolean; confirming: boolean }
  | { kind: "found"; phone: string; children: ChildRef[] }
  | { kind: "found-2fa"; phone: string; childCount: number }
  | { kind: "linked"; children: ChildRef[]; canAddMore: boolean }
  /** 🔴 TASK-591 — `dupMessage` is the SERVER's sentence for this refusal (its body carries both languages). */
  | { kind: "form"; dupName?: string; dupMessage?: string }
  | { kind: "confirm" }
  | { kind: "done"; result: CreateResult };

/**
 * 🔴 TASK-591 — two new details ride: `missing` (WHICH address part is absent) and `message` (the duplicate refusal's own
 * words, in both languages, **from the server**). 🔑 The page renders them; it keeps no copy of that sentence.
 */
type Failure = {
  code: RegisterCode | "UNREACHABLE";
  word?: string;
  max?: number;
  name?: string;
  province?: string;
  missing?: Array<"province" | "district" | "subDistrict">;
  message?: { TH?: string; EN?: string };
};

/** §2 (TASK-357) — a button whose label may wrap on a narrow phone instead of being cut. Height follows the text. */
const WRAP_LABEL = { root: { height: "auto", minHeight: 36, paddingTop: 6, paddingBottom: 6 }, label: { whiteSpace: "normal" as const, textAlign: "center" as const } };

const isRefusal = (r: unknown): r is Refusal | Unreachable =>
  typeof r === "object" && r !== null && (r as { ok?: boolean }).ok === false;

export default function RegisterContent() {
  const { t, lang, setLangIfUnset } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: "liff" });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  // The credential. Held in a ref, not state: it is read inside callbacks and never rendered.
  const idToken = useRef<string>("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  // §7a — two ways in, ONE value out. `birthDateTyped` is the plain field; `birthDatePicked` is what the picker
  // emitted, already reordered to `DD-MM-YYYY`. `birthDate` is the stored value, whichever way is showing.
  const [dobMode, setDobMode] = useState<"pick" | "type">("pick");
  const [birthDateTyped, setBirthDateTyped] = useState("");
  const [birthDatePicked, setBirthDatePicked] = useState<string | null>(null); // the widget's own `YYYY-MM-DD`
  const birthDate = dobMode === "pick" ? toCustomerDate(birthDatePicked) : birthDateTyped.trim();
  // §7b — same shape: three picks joined, or the plain field. `addressLine` is the one-line string the customer
  // stores (TASK-353: into `parents.note`); the PICKED province also travels on its own, full name, for the column.
  /**
   * 🔴 **TASK-590 (BE) → TASK-591 — the TYPED address mode is GONE, and its absence is the contract.** The server no longer
   * reads a pre-joined line; it needs **three parts**, and a typed line has no province to give. ⇒ **three pickers, always.**
   * 🚫 Not "kept and validated": a mode whose output the server ignores is a mode that sends the wrong thing eventually.
   * 📌 The birthday's type-instead toggle is untouched — that one still produces what the server reads.
   */
  const [book, setBook] = useState<AddressBook | null>(null);
  const [provPick, setProvPick] = useState<AreaPick | null>(null);
  const [distPick, setDistPick] = useState<AreaPick | null>(null);
  const [subPick, setSubPick] = useState<AreaPick | null>(null);
  const [districts, setDistricts] = useState<AreaPick[]>([]);
  const [subDistricts, setSubDistricts] = useState<AreaPick[]>([]);
  /** Display only — 🚫 never sent. The server builds the stored line from the three parts, in its own order. */
  const addressLine = joinAddress({ subDistrict: subPick?.nameTh, district: distPick?.nameTh, province: provPick?.nameTh });
  /** 🔑 All THREE, or the address is not answered. Two parts do not submit — the same shape the server requires. */
  const addressComplete = Boolean(provPick?.nameTh && distPick?.nameTh && subPick?.nameTh);
  // TASK-353 (§9) — PICKED ⇒ the province's FULL name for `parents.province`; TYPED ⇒ nothing (the server does not
  // guess, and a wrong bucket is worse than an empty one). `กทม` stays in the LINE; `กรุงเทพมหานคร` goes to the column.
  const pickedProvince = provPick?.nameTh ?? "";

  /**
   * 🔴 TASK-566 (REQ-110 item 10) — **does this household already have an address?** Read off `/status`, `/link` and the
   * CREATE's own answer. 🚫 **Never re-fetched to find out**: the create returns the new state, so the second child's form
   * already knows. ⚠️ When it is true the address question is **ABSENT** — *a field you cannot use is a question you are
   * still asking.*
   */
  const [addressOnFile, setAddressOnFile] = useState(false);
  /** The province the server sent with it — shown back, because an address we cannot show is not one we collected. */
  const [provinceOnFile, setProvinceOnFile] = useState<string | null>(null);
  /**
   * 🔑 TASK-566 (REQ-110 item 10) — **every field is required, and the address only while the household has none.**
   * ONE expression, read by the Continue button, the Confirm button and the pre-request guard: three doors, one rule.
   */
  const formComplete = Boolean(name.trim()) && Boolean(birthDate) && (addressOnFile || addressComplete);
  /**
   * 🔴 **TASK-591 — the phone of an UNLINKED account, carried from `/lookup`'s "new".** `/link` writes nothing for a new
   * number, so the family is created by `/create` WITH this phone, in one transaction with the child.
   * 🚫 **Nothing is half-linked, because nothing is written until the child is accepted.**
   */
  const [newPhone, setNewPhone] = useState<string | null>(null);
  /**
   * 🔑 TASK-566 — **every field is required**, and the address only while the household has none on file. ONE expression,
   * read by the Continue button, the Confirm button and the pre-request guard — three doors, one rule.
   */
  /** AC-9 — set after `NAME_DUPLICATE_NEEDS_DETAIL`; the resubmit carries `detailProvided: true`. */
  const [detailProvided, setDetailProvided] = useState(false);

  const initLiff = useCallback(async () => {
    const s = await obtainIdToken();
    if (s.kind === "ready") {
      idToken.current = s.idToken;
      // §8 — a first visit speaks the phone's language; a saved toggle wins (`setLangIfUnset` checks storage).
      setLangIfUnset(await phoneLanguage());
      // §10.3 — before the phone field: is this account already someone's? The server says; the page renders.
      // (A token obtained this instant cannot be EXPIRED, so this one call goes without the retry wrapper.)
      const st = await status(s.idToken);
      if (isRefusal(st)) {
        fail(st);
        setPhase({ kind: "phone" });
      } else if (st.linked) {
        setAddressOnFile(st.addressOnFile); // TASK-566 — learned here, not asked for again
        setProvinceOnFile(st.province);
        // 🔴 TASK-580 (D11 · F-B) — a linked family with NO children went to a screen offering only "unlink" or "close":
        // a dead end for the very family that is trying to register. **Zero children ⇒ straight to the form**, the same rule
        // `afterLink` already uses. 🚫 The CAP itself is never computed here — `canAddMore` is the server's word.
        if (st.childCount === 0 && st.canAddMore) setPhase({ kind: "form" });
        else setPhase({ kind: "already-linked", phone: st.phone, childCount: st.childCount, canAddMore: st.canAddMore, confirming: false });
      } else {
        setPhase({ kind: "phone" });
      }
    } else if (s.kind === "missing-id") setPhase({ kind: "liff-missing" });
    else if (s.kind === "not-logged-in") setPhase({ kind: "liff-login" });
    else setPhase({ kind: "liff-failed", detail: s.detail });
  }, [setLangIfUnset]);

  useEffect(() => {
    void initLiff();
  }, [initLiff]);

  // §7b — the dataset is loaded ONLY here, only when the form is on screen, only in pick mode. If the chunk
  // cannot be fetched (an old phone, a bad signal) the plain field takes over — the escape hatch, automatically.
  useEffect(() => {
    if (phase.kind !== "form" || book) return;
    let alive = true;
    loadAddressBook().then(
      (b) => alive && setBook(b),
      /**
       * ⚠️ **TASK-591 — there is no typed fallback any more** (the server needs three parts, and a typed line has none).
       * A dataset that will not load leaves the three pickers disabled with their "loading" placeholder, and the submit
       * shut — 🔑 **which is honest: without the list we cannot produce an address the server will accept.**
       * 🚫 We do not send two parts and hope.
       */
      () => alive && setBook(null),
    );
    return () => {
      alive = false;
    };
  }, [phase.kind, book]);

  const pickProvince = async (code: string | null) => {
    const p = book?.provinces.find((x) => x.code === code) ?? null;
    setProvPick(p);
    setDistPick(null);
    setSubPick(null);
    setSubDistricts([]);
    setDistricts(p && book ? await book.districtsOf(p.code) : []);
  };
  const pickDistrict = async (code: string | null) => {
    const d = districts.find((x) => x.code === code) ?? null;
    setDistPick(d);
    setSubPick(null);
    setSubDistricts(d && book ? await book.subDistrictsOf(d.code) : []);
  };
  const pickSubDistrict = (code: string | null) => setSubPick(subDistricts.find((x) => x.code === code) ?? null);
  // TASK-351 (§8b) — LABELS follow the language; VALUES stay Thai. Thai labels are `tierWordsFor`'s four words with
  // the Bangkok flip (the SOURCE); English is @Porter's `District · Sub-district` from the dictionary — one word
  // covers both เขต and อำเภอ. (TASK-350 §3 ruled "stay Thai" from a sentence about VALUES; the screen corrected it.)
  const tierTh = tierWordsFor(provPick?.code ?? null);
  const tier =
    lang === "th" ? tierTh : { district: t("register.addrDistrict"), subDistrict: t("register.addrSubDistrict") };
  // §10.2 — the option LABEL follows the language (DISPLAY); the option VALUE is the geocode either way, and what
  // is picked, joined and sent is `nameTh` regardless — the stored strings are Thai.
  const asOptions = (rows: AreaPick[]) =>
    // 🔴 TASK-580 §2 (F-D) — THAI names in both languages: the dataset's English is garbled (*"Khnong Tntnai"*), the Thai
    // is correct, and the Thai is what we store. The field LABELS are still translated; only the area names are not.
    rows.map((r) => ({ value: r.code, label: r.nameTh }));

  /**
   * §C0 — `TOKEN_EXPIRED` ⇒ re-init LIFF and retry ONCE. Nothing else is retried: `TOKEN_WRONG_CHANNEL` is a
   * misconfiguration a parent cannot fix, and the other codes are decisions, not transport.
   */
  const withToken = useCallback(
    async <T,>(call: (token: string) => Promise<T | Refusal | Unreachable>): Promise<T | Refusal | Unreachable> => {
      const first = await call(idToken.current);
      if (isRefusal(first) && first.code === "TOKEN_EXPIRED") {
        const s = await obtainIdToken();
        if (s.kind !== "ready") return first;
        idToken.current = s.idToken;
        return call(idToken.current);
      }
      return first;
    },
    [],
  );

  const fail = (r: Refusal | Unreachable) =>
    setFailure({
      code: r.code,
      word: (r as Refusal).word,
      max: (r as Refusal).max,
      name: (r as Refusal).name,
      province: (r as Refusal).province,
      missing: (r as Refusal).missing,
      message: (r as Refusal).message,
    });

  /** After `/link`: the §6.1 decision, READ off the response — children ⇒ the list, none ⇒ add one. */
  const afterLink = (children: ChildRef[], canAddMore: boolean, addressOn = false, province: string | null = null) => {
    setAddressOnFile(addressOn); // TASK-566 — the link answers with it, so the form never has to ask a second time
    setProvinceOnFile(province);
    if (children.length === 0) setPhase({ kind: "form" });
    else setPhase({ kind: "linked", children, canAddMore });
  };

  const submitPhone = async () => {
    setFailure(null);
    setBusy(true);
    const r = await withToken((tok) => lookup(tok, phone));
    setBusy(false);
    if (isRefusal(r)) return fail(r);
    if (r.outcome === "new") {
      /**
       * 🔴 **TASK-590 (BE) → TASK-591 — `/link` is NOT called for a new number any more, and that is the fix.** It used to
       * CREATE the parent at the phone step, which is how a family could exist with no child (D11). The new contract writes
       * **nothing** until the first child is accepted ⇒ **we keep the phone and go to the form; `/create` carries it.**
       * 🚫 No binding, no menus, no session change — so there is no half-linked state to recover from.
       */
      setNewPhone(r.phone);
      setAddressOnFile(false); // a new household has none on file, so the address is asked
      setProvinceOnFile(null);
      return setPhase({ kind: "form" });
    }
    if ("twoFactor" in r) return setPhase({ kind: "found-2fa", phone: r.phone, childCount: r.childCount });
    setPhase({ kind: "found", phone: r.phone, children: r.children });
  };

  /** §10.3 — UNLINK, after the second tap. Clears the FAMILY's binding (every account), then the normal flow. */
  const submitUnlink = async () => {
    setFailure(null);
    setBusy(true);
    const r = await withToken((tok) => unlink(tok));
    setBusy(false);
    if (isRefusal(r)) return fail(r);
    setPhase({ kind: "phone", unlinked: true }); // `unlinked: false` (was not linked) proceeds the same way
  };

  /** The bind — a TAP, so a parent sees their family before anything is written (§C1's reason for `lookup`). */
  const submitLink = async () => {
    setFailure(null);
    setBusy(true);
    const r = await withToken((tok) => link(tok, phone, code || undefined));
    setBusy(false);
    if (isRefusal(r)) return fail(r);
    /**
     * 🔻 **TASK-591 — `/link` has two arms now.** This path is reached from the "found" screens, so the answer should be
     * `"linked"` — but the type says it may be `"new"`, and 🔑 **that is a real race: the family could have been archived
     * between the lookup and the tap.** ⇒ handle it as the phone step does rather than casting it away.
     */
    if (r.outcome === "new") {
      setNewPhone(r.phone);
      setAddressOnFile(false);
      setProvinceOnFile(null);
      return setPhase({ kind: "form" });
    }
    afterLink(r.children, r.canAddMore, r.addressOnFile, r.province);
  };

  const submitCreate = async () => {
    // 🔑 TASK-566 — the two-guard lesson (TASK-564): the button is disabled AND nothing is sent. Every field is required
    // now, so an empty one is not a request the server should have to refuse.
    if (!formComplete) return;
    setFailure(null);
    setBusy(true);
    const r = await withToken((tok) =>
      create(tok, {
        name: name.trim(),
        // 🔴 A blank is the SKIP and is OMITTED — never sent as "" (TASK-347 §5.1). `api.ts` drops empty keys.
        birthDate: birthDate || undefined,
        // 🚫 When the household already has an address, neither field is sent — the server ignores them anyway, and a
        // body that carries what it cannot use is a question we are still asking.
        // 🔴 TASK-591 — THREE parts, never a joined line: the server builds the stored string itself.
        province: addressOnFile ? undefined : pickedProvince || undefined,
        district: addressOnFile ? undefined : distPick?.nameTh || undefined,
        subDistrict: addressOnFile ? undefined : subPick?.nameTh || undefined,
        // 🔑 The phone of an UNLINKED account: the family and this child are created in ONE transaction.
        phone: newPhone ?? undefined,
        detailProvided: detailProvided || undefined,
      }),
    );
    setBusy(false);
    if (isRefusal(r)) {
      // AC-9 — more detail, never a rename: back to the form with the hint, and the next submit says so.
      if (r.code === "NAME_DUPLICATE_NEEDS_DETAIL") {
        setDetailProvided(true);
        setPhase({
          kind: "form",
          dupName: (r as Refusal).name,
          // 🔑 The server's own words, in the reader's language — the page holds them for this render only and keeps no copy.
          dupMessage: (lang === "th" ? (r as Refusal).message?.TH : (r as Refusal).message?.EN) ?? undefined,
        });
        // 🔴 TASK-577 F-E — and NOTHING else. This used to fall through to `fail(r)` as well, so the same refusal drew
        // TWO boxes: the red one at the top of the page (the owner APPROVED words) and an orange one above the field
        // (the chat OLD words). 🔑 The owner ruled a REWORD, so there is one box — and it carries the approved sentence,
        // at the field, which is where the parent has to act.
        setFailure(null);
        return;
      } else if (
        r.code === "NAME_REQUIRED" ||
        r.code === "NAME_RESERVED" ||
        r.code === "BIRTHDATE_INVALID" ||
        r.code === "BIRTHDATE_REQUIRED" ||
        r.code === "ADDRESS_REQUIRED" ||
        // 🔴 TASK-591 — fixable here too, and the words NAME the missing part rather than calling the address wrong.
        r.code === "ADDRESS_INCOMPLETE" ||
        r.code === "PROVINCE_UNKNOWN"
      ) {
        setPhase({ kind: "form" }); // fixable here — go back to the field
      } else if (r.code === "PHONE_NOW_REGISTERED") {
        /**
         * 🔴 **TASK-591 — somebody registered that number between our lookup and this save.** 🚫 Nothing was written for us
         * (the family and the child are one transaction), so the honest place to send them is back to the phone step —
         * **still unlinked, and told why.**
         */
        setNewPhone(null);
        setPhase({ kind: "phone" });
      } else if (r.code === "NOT_LINKED") {
        setPhase({ kind: "phone" }); // the family is not bound; start from the phone
      }
      return fail(r);
    }
    // 🔑 The answer carries the new household state — the next child's form needs no second request to know.
    setAddressOnFile(r.addressOnFile);
    setProvinceOnFile(r.province);
    // 🔑 The family exists now (created WITH this child), so the phone has done its one job and must not ride again.
    setNewPhone(null);
    setPhase({ kind: "done", result: r });
  };

  const startAnotherChild = () => {
    setName("");
    setBirthDateTyped("");
    setBirthDatePicked(null);

    setProvPick(null);
    setDistPick(null);
    setSubPick(null);
    setDistricts([]);
    setSubDistricts([]);
    setDetailProvided(false);
    setFailure(null);
    setPhase({ kind: "form" });
  };

  return (
    /* The page's own language scope also drives the date picker's month names (the root DatesProvider follows the
       ADMIN's language, which this page deliberately does not share). */
    <DatesProvider settings={{ locale: lang, firstDayOfWeek: 0 }}>
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Paper withBorder shadow="sm" radius="lg" p="xl" className="w-full max-w-sm">
        <Stack gap="md">
          {/* §8 — "ทำปุ่มเด่นๆ": the FIRST thing on the page, every phase, before any field. One language at a time. */}
          <LanguageToggle size="md" fullWidth />
          {phase.kind !== "done" && <Title order={3}>{t("register.title")}</Title>}

          {failure && <FailureAlert failure={failure} />}

          {phase.kind === "liff" && <Centered text={t("register.liffLoggingIn")} />}
          {phase.kind === "liff-login" && <Centered text={t("register.liffLoggingIn")} />}
          {phase.kind === "liff-missing" && (
            /* ⚠️ The absent-LIFF-ID case is a MESSAGE, not a blank screen (TASK-348 §3). */
            <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light">
              {t("register.liffMissing")}
            </Alert>
          )}
          {phase.kind === "liff-failed" && (
            <Stack gap="xs">
              <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
                {t("register.liffFailed")}
              </Alert>
              <Text fz="xs" c="dimmed">
                {phase.detail}
              </Text>
              <Button variant="light" onClick={initLiff}>
                {t("register.retry")}
              </Button>
            </Stack>
          )}

          {phase.kind === "already-linked" && (
            /* §10.3 — TOLD, not silent. The masked phone is the SERVER's; a count, no names (TASK-047). The close
               path is the plain one; UNLINK is red, outlined, and takes a SECOND tap with the family-wide warning
               in front of it — a parent who opened the link by accident must not unlink by accident. */
            <Stack gap="sm">
              <Text fw={600}>{t("register.alreadyLinkedTitle")}</Text>
              {/* §3 (TASK-357) — `1 child`, `2 children`: one ternary, one place; Thai has no plural and uses the same sentence. */}
              <Text fz="sm">
                {t(phase.childCount === 1 ? "register.alreadyLinkedToOne" : "register.alreadyLinkedTo", {
                  phone: phase.phone,
                  n: phase.childCount,
                })}
              </Text>
              {/* 🔴 TASK-580 (D11 · Tanya's F-B) — the way OUT of this screen for a family that came to add a child.
                  🚫 The button is not shown-and-disabled at the cap: ⚠️ **a family at the cap gets the SENTENCE instead**,
                  because a dead control with no explanation is the same dead end in a quieter costume. */}
              {phase.canAddMore ? (
                <Button variant="light" leftSection={<UserPlus size={16} />} data-add-child onClick={startAnotherChild}>
                  {t("register.addChild")}
                </Button>
              ) : (
                <Text fz="sm" c="dimmed" data-family-full>
                  {t("register.familyFull")}
                </Text>
              )}
              <Text fz="xs" c="dimmed">
                {t("register.closeHint")}
              </Text>
              {!phase.confirming ? (
                <Button
                  variant="outline"
                  color="red"
                  leftSection={<Link2Off size={16} />}
                  /* §2 (TASK-357) — the label WRAPS: a 360-px phone cut the old one at "…LINE conn". Short + wrap, both. */
                  styles={WRAP_LABEL}
                  onClick={() => setPhase({ ...phase, confirming: true })}
                >
                  {t("register.unlinkButton")}
                </Button>
              ) : (
                <Stack gap="xs">
                  <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
                    {t("register.unlinkWarning")}
                  </Alert>
                  <Button color="red" loading={busy} leftSection={<Link2Off size={16} />} styles={WRAP_LABEL} onClick={submitUnlink}>
                    {t("register.unlinkConfirm")}
                  </Button>
                  <Button variant="default" disabled={busy} onClick={() => setPhase({ ...phase, confirming: false })}>
                    {t("register.unlinkCancel")}
                  </Button>
                </Stack>
              )}
            </Stack>
          )}

          {phase.kind === "phone" && (
            <Stack gap="sm">
              {phase.unlinked && (
                <Alert color="blue" variant="light">
                  {t("register.unlinkedNotice")}
                </Alert>
              )}
              <TextInput
                label={t("register.phoneLabel")}
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                inputMode="tel"
                autoComplete="tel"
                required
              />
              <Button loading={busy} disabled={!phone.trim()} onClick={submitPhone}>
                {t("register.phoneSubmit")}
              </Button>
            </Stack>
          )}

          {phase.kind === "found" && (
            <Stack gap="sm">
              <Text fw={600}>
                <Users size={16} className="mr-1 inline" />
                {t("register.foundTitle")}
              </Text>
              <ChildList children={phase.children} />
              <Text fz="sm" c="dimmed">
                {t("register.linkedPhone", { phone: phase.phone })}
              </Text>
              <Button loading={busy} onClick={submitLink}>
                {t("register.foundConfirm")}
              </Button>
            </Stack>
          )}

          {phase.kind === "found-2fa" && (
            /* 🔀 2FA is ON: the API said so, and the names are hidden behind the code. The page renders that; it
               does not decide it. */
            <Stack gap="sm">
              <Text fw={600}>{t("register.foundTitle")}</Text>
              <Text fz="sm" c="dimmed">
                {t("register.twofaHint", { n: phase.childCount })}
              </Text>
              <TextInput
                label={t("register.twofaLabel")}
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
                inputMode="numeric"
                maxLength={6}
                required
              />
              <Button loading={busy} disabled={!code.trim()} onClick={submitLink}>
                {t("register.foundConfirm")}
              </Button>
            </Stack>
          )}

          {phase.kind === "linked" && (
            /* §6.1 — the children are LISTED and adding one is an ACTION, never a forced form. */
            <Stack gap="sm">
              <Text fw={600}>{t("register.linkedTitle")}</Text>
              <Text fz="sm" c="dimmed">
                {t("register.childrenTitle")}
              </Text>
              <ChildList children={phase.children} />
              {phase.canAddMore ? (
                <Button variant="light" leftSection={<UserPlus size={16} />} onClick={startAnotherChild}>
                  {t("register.addChild")}
                </Button>
              ) : (
                <Text fz="sm" c="dimmed">
                  {t("register.familyFull")}
                </Text>
              )}
              <Text fz="xs" c="dimmed">
                {t("register.closeHint")}
              </Text>
            </Stack>
          )}

          {phase.kind === "form" && (
            <Stack gap="sm">
              {phase.dupName && (
                /* AC-9 — the server asked for MORE DETAIL; the field keeps what was typed and the box says why.
                   🔴 TASK-577 F-E — ONE box, at the field, where the parent has to act (the page-top alert no longer
                   fires for this code). 🔻 **TASK-591 — and the WORDS are the server's now:** TASK-590 sends them in both
                   languages, so 🚫 the page keeps no copy at all. *Three homes in three rounds — the chat's words, an
                   approved reword held here, now the server's body — and the drift is exactly why they moved.* */
                <Alert color="orange" variant="light" data-dup-box>
                  {phase.dupMessage}
                </Alert>
              )}
              <TextInput
                label={t("register.nameLabel")}
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />
              {dobMode === "pick" ? (
                /* §7a — YEAR-FIRST: the popover opens on the decade grid, so a birth year 2–15 years back is one
                   or two taps, then month, then day. The widget emits `YYYY-MM-DD`; `toCustomerDate` reorders it
                   to the customer's `DD-MM-YYYY` and nothing parses it. `valueFormat` is DISPLAY only. */
                <DatePickerInput
                  label={t("register.birthDateLabel")}
                  placeholder={t("register.dobPickPlaceholder")}
                  required
                  value={birthDatePicked}
                  onChange={setBirthDatePicked}
                  valueFormat="DD-MM-YYYY"
                  defaultLevel="decade"
                  clearable
                  popoverProps={{ withinPortal: true }}
                />
              ) : (
                <TextInput
                  label={t("register.birthDateLabel")}
                  placeholder={t("register.birthDatePlaceholder")}
                  required
                  value={birthDateTyped}
                  onChange={(e) => setBirthDateTyped(e.currentTarget.value)}
                  inputMode="numeric"
                  /* 🚫 No parsing on the page — an input MASK only. The server runs the chat's own parser. */
                  maxLength={10}
                />
              )}
              <EntryToggle
                mode={dobMode}
                typeLabel={t("register.typeInstead")}
                pickLabel={t("register.dobPickInstead")}
                onToggle={() => setDobMode(dobMode === "pick" ? "type" : "pick")}
              />

              {/* 🔴 TASK-566 — when the household already has an address the question is **ABSENT**: not disabled, not
                  prefilled-and-locked. 🔑 *A field you cannot use is a question you are still asking* — and the server
                  ignores an address sent while one is on file, so leaving it on screen could only mislead.
                  ⚠️ A family that only ever typed its address in the CHAT has none stored, so it IS asked once more — the
                  note explains that in the parent's terms rather than letting it read as “we lost your address”. */}
              {addressOnFile ? (
                <Text fz="xs" c="dimmed" data-address-on-file={provinceOnFile || "yes"}>
                  {provinceOnFile ? t("register.addressOnFileProvince", { province: provinceOnFile }) : t("register.addressOnFile")}
                </Text>
              ) : (
                <>
                {/* 🔴 TASK-591 — a family we ALREADY know, asked again because the address is three parts now.
                    ⚠️ It must not read as "we lost your address": what they gave us was valid when they gave it, and
                    `newPhone === null` is exactly "this account is already linked" — so the sentence is shown only to them. */}
                {newPhone === null && (
                  <Text fz="xs" c="dimmed" data-address-ask-again>
                    {t("register.addressAskAgain")}
                  </Text>
                )}
                /* §7b — จังหวัด → เขต/อำเภอ → แขวง/ตำบล, each list read from the dataset by GEOCODE. The tier
                   words follow the province (Bangkok เขต/แขวง, elsewhere อำเภอ/ตำบล). The three picks JOIN into
                   the chat's one-line string — `พระโขนงเหนือ วัฒนา กทม`, that order, that abbreviation. */
                /* §4 nit 2 — the typing instruction (`provinceLabel`) is NOT shown here: in pick mode the tier
                   labels ARE the instruction. It stays on the typed field below. */
                <Stack gap="xs">
                  <Select
                    label={t("register.addrProvince")}
                    required
                    placeholder={book ? t("register.addrPickPlaceholder") : t("register.addrLoading")}
                    data={asOptions(book?.provinces ?? [])}
                    value={provPick?.code ?? null}
                    onChange={pickProvince}
                    disabled={!book}
                    searchable
                    clearable
                    comboboxProps={{ withinPortal: true }}
                  />
                  <Select
                    label={tier.district}
                    placeholder={t("register.addrPickPlaceholder")}
                    data={asOptions(districts)}
                    value={distPick?.code ?? null}
                    onChange={pickDistrict}
                    disabled={!provPick}
                    searchable
                    clearable
                    comboboxProps={{ withinPortal: true }}
                  />
                  <Select
                    label={tier.subDistrict}
                    placeholder={t("register.addrPickPlaceholder")}
                    data={asOptions(subDistricts)}
                    value={subPick?.code ?? null}
                    onChange={pickSubDistrict}
                    disabled={!distPick}
                    searchable
                    clearable
                    comboboxProps={{ withinPortal: true }}
                  />
                </Stack>
                </>
              )}
              {/* 🔻 TASK-591 — the address's "type instead" toggle is GONE. The server needs three parts and a typed line
                  has no province to give, so a typed mode could only ever produce a body the server refuses.
                  🚫 Removed rather than left disabled: a control that cannot succeed is worse than no control. */}
              {/* 🔑 Disabled until every required field is filled — and `submitCreate` refuses too (TASK-564's two guards). */}
              <Button disabled={!formComplete} data-form-next onClick={() => setPhase({ kind: "confirm" })}>
                {t("register.formNext")}
              </Button>
            </Stack>
          )}

          {phase.kind === "confirm" && (
            /* 🔴 TASK-277 / §C3 — the CONFIRM step is load-bearing: `03-04-2024` is ambiguous to a human, and
               the server will not show it back. The date is echoed EXACTLY as typed, `DD-MM-YYYY`, before it is
               sent. This is §17c screens 7a/7b as a screen instead of a typed "ยืนยัน". */
            <Stack gap="sm">
              <Text fw={600}>{t("register.confirmTitle")}</Text>
              <div className="rounded-lg bg-muted-100 p-3 text-sm">
                <ReviewRow label={t("register.reviewName")} value={name.trim()} />
                {/* 🚫 TASK-566 — no `(skipped)` fallback: nothing here can be empty now, and a fallback for a state that
                    cannot happen is an invitation to make it happen again. The address row shows what is ON FILE when the
                    household has one, because that is what will be used. */}
                <ReviewRow label={t("register.reviewBirthDate")} value={birthDate} />
                <ReviewRow label={t("register.reviewProvince")} value={addressOnFile ? provinceOnFile || t("register.addressOnFile") : addressLine} />
              </div>
              <Text fz="sm">{t("register.confirmQuestion")}</Text>
              <Button loading={busy} disabled={!formComplete} data-confirm-save onClick={submitCreate}>
                {t("register.confirmSave")}
              </Button>
              <Button variant="subtle" color="gray" disabled={busy} onClick={() => setPhase({ kind: "form" })}>
                {t("register.confirmBack")}
              </Button>
            </Stack>
          )}

          {phase.kind === "done" && (
            <Stack gap="sm" align="center" className="text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 size={32} />
              </span>
              <Text fw={600}>
                {t("register.createdTitle", { name: phase.result.student.name })}
                {phase.result.atMax ? t("register.createdAtMax", { max: phase.result.count }) : ""}
              </Text>
              {phase.result.birthDate && (
                /* The server's `DD-MM-YYYY`, back — `time.ts`'s ONE formatter, not the page's echo. */
                <Text fz="sm" c="dimmed">
                  {t("register.reviewBirthDate")}: {phase.result.birthDate}
                </Text>
              )}
              <Text fz="sm" c="dimmed">
                {t("register.createdCount", { count: phase.result.count })}
              </Text>
              {phase.result.canAddMore && (
                <Button variant="light" leftSection={<UserPlus size={16} />} onClick={startAnotherChild}>
                  {t("register.addChild")}
                </Button>
              )}
              <Text fz="xs" c="dimmed">
                {t("register.closeHint")}
              </Text>
            </Stack>
          )}
        </Stack>
      </Paper>
    </div>
    </DatesProvider>
  );
}

/**
 * One rendering per NAMED CODE — the words for a decision the server made.
 *
 * 🔴 **TASK-590 (BE) → TASK-591 — and ONE exception, on instruction: when the server sends the WORDS, they win.** The
 * duplicate-name refusal now arrives with both languages in its body. 🔑 **One sentence, one source** — *so the chat, the
 * page and the server cannot drift into three versions of the same refusal, which is exactly what happened to this one.*
 * 🚫 **No local copy of it survives as a fallback:** a fallback is a second source.
 */
function FailureAlert({ failure }: { failure: Failure }) {
  const { t, lang } = useI18n();
  const sent = lang === "th" ? failure.message?.TH : failure.message?.EN;
  const text =
    failure.code === "UNREACHABLE"
      ? t("register.connectFail")
      : (sent ??
        t(`register.code.${failure.code}`, {
          word: failure.word ?? "",
          max: failure.max ?? "",
          name: failure.name ?? "",
          province: failure.province ?? "",
          // 🔑 `ADDRESS_INCOMPLETE` NAMES the part: "we still need the sub-district", not "that is wrong".
          missing: (failure.missing ?? []).map((m) => t(`register.addrPart_${m}`)).join(", "),
        }));
  return (
    // 🔑 TASK-591 — the code rides on the element, so a test can name WHICH refusal it is reading instead of hunting for
    // text that also appears in a field label.
    <Alert color="red" icon={<AlertTriangle size={16} />} variant="light" data-failure={failure.code}>
      {text}
    </Alert>
  );
}

function ChildList({ children }: { children: ChildRef[] }) {
  return (
    <ul className="rounded-lg bg-muted-100 p-3 text-sm">
      {children.map((c) => (
        <li key={c.id} className="py-0.5">
          {/* §4 — the chat's screen 4 lists `มิลล่า, มิลลิม, asda`: the nickname only when it DIFFERS. */}
          {c.nickname && c.nickname !== c.name ? `${c.name} (${c.nickname})` : c.name}
        </li>
      ))}
    </ul>
  );
}

/** The escape hatch (§7a/§7b): a picker is never the only way in. One line, under the widget it swaps. */
function EntryToggle({
  mode,
  typeLabel,
  pickLabel,
  onToggle,
}: {
  mode: "pick" | "type";
  typeLabel: string;
  pickLabel: string;
  onToggle: () => void;
}) {
  return (
    <Button variant="subtle" size="compact-xs" color="gray" className="self-start" onClick={onToggle}>
      {mode === "pick" ? typeLabel : pickLabel}
    </Button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-muted-500">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Loader />
      <p className="text-sm text-muted-500">{text}</p>
    </div>
  );
}
