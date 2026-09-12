"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Loader, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { AlertTriangle, CheckCircle2, UserPlus, Users } from "lucide-react";
import { useT } from "@/lib/i18n";
import { obtainIdToken } from "@/lib/register/liff";
import {
  create,
  link,
  lookup,
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
 */

type Phase =
  | { kind: "liff" }
  | { kind: "liff-missing" }
  | { kind: "liff-login" }
  | { kind: "liff-failed"; detail: string }
  | { kind: "phone" }
  | { kind: "found"; phone: string; children: ChildRef[] }
  | { kind: "found-2fa"; phone: string; childCount: number }
  | { kind: "linked"; children: ChildRef[]; canAddMore: boolean }
  | { kind: "form"; dupName?: string }
  | { kind: "confirm" }
  | { kind: "done"; result: CreateResult };

type Failure = { code: RegisterCode | "UNREACHABLE"; word?: string; max?: number; name?: string };

const isRefusal = (r: unknown): r is Refusal | Unreachable =>
  typeof r === "object" && r !== null && (r as { ok?: boolean }).ok === false;

export default function RegisterContent() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>({ kind: "liff" });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  // The credential. Held in a ref, not state: it is read inside callbacks and never rendered.
  const idToken = useRef<string>("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [province, setProvince] = useState("");
  /** AC-9 — set after `NAME_DUPLICATE_NEEDS_DETAIL`; the resubmit carries `detailProvided: true`. */
  const [detailProvided, setDetailProvided] = useState(false);

  const initLiff = useCallback(async () => {
    const s = await obtainIdToken();
    if (s.kind === "ready") {
      idToken.current = s.idToken;
      setPhase({ kind: "phone" });
    } else if (s.kind === "missing-id") setPhase({ kind: "liff-missing" });
    else if (s.kind === "not-logged-in") setPhase({ kind: "liff-login" });
    else setPhase({ kind: "liff-failed", detail: s.detail });
  }, []);

  useEffect(() => {
    void initLiff();
  }, [initLiff]);

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
    setFailure({ code: r.code, word: (r as Refusal).word, max: (r as Refusal).max, name: (r as Refusal).name });

  /** After `/link`: the §6.1 decision, READ off the response — children ⇒ the list, none ⇒ add one. */
  const afterLink = (children: ChildRef[], canAddMore: boolean) => {
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
      // 🔑 A NEW family: `/link` CREATES the parent (§C5.1), exactly as the chat does on phone entry. Then the
      // form — there are no children to list, and the contract's `isNew` is that fact.
      setBusy(true);
      const l = await withToken((tok) => link(tok, phone));
      setBusy(false);
      if (isRefusal(l)) return fail(l);
      return afterLink(l.children, l.canAddMore);
    }
    if ("twoFactor" in r) return setPhase({ kind: "found-2fa", phone: r.phone, childCount: r.childCount });
    setPhase({ kind: "found", phone: r.phone, children: r.children });
  };

  /** The bind — a TAP, so a parent sees their family before anything is written (§C1's reason for `lookup`). */
  const submitLink = async () => {
    setFailure(null);
    setBusy(true);
    const r = await withToken((tok) => link(tok, phone, code || undefined));
    setBusy(false);
    if (isRefusal(r)) return fail(r);
    afterLink(r.children, r.canAddMore);
  };

  const submitCreate = async () => {
    setFailure(null);
    setBusy(true);
    const r = await withToken((tok) =>
      create(tok, {
        name: name.trim(),
        // 🔴 A blank is the SKIP and is OMITTED — never sent as "" (TASK-347 §5.1). `api.ts` drops empty keys.
        birthDate: birthDate.trim() || undefined,
        province: province.trim() || undefined,
        detailProvided: detailProvided || undefined,
      }),
    );
    setBusy(false);
    if (isRefusal(r)) {
      // AC-9 — more detail, never a rename: back to the form with the hint, and the next submit says so.
      if (r.code === "NAME_DUPLICATE_NEEDS_DETAIL") {
        setDetailProvided(true);
        setPhase({ kind: "form", dupName: (r as Refusal).name });
      } else if (r.code === "NAME_REQUIRED" || r.code === "NAME_RESERVED" || r.code === "BIRTHDATE_INVALID") {
        setPhase({ kind: "form" }); // fixable here — go back to the field
      } else if (r.code === "NOT_LINKED") {
        setPhase({ kind: "phone" }); // the family is not bound; start from the phone
      }
      return fail(r);
    }
    setPhase({ kind: "done", result: r });
  };

  const startAnotherChild = () => {
    setName("");
    setBirthDate("");
    setProvince("");
    setDetailProvided(false);
    setFailure(null);
    setPhase({ kind: "form" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Paper withBorder shadow="sm" radius="lg" p="xl" className="w-full max-w-sm">
        <Stack gap="md">
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

          {phase.kind === "phone" && (
            <Stack gap="sm">
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
                /* AC-9 — the server asked for MORE DETAIL; the field keeps what was typed and the hint says why. */
                <Alert color="orange" variant="light">
                  {t("register.dupDetailHint")}
                </Alert>
              )}
              <TextInput
                label={t("register.nameLabel")}
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />
              <TextInput
                label={t("register.birthDateLabel")}
                placeholder={t("register.birthDatePlaceholder")}
                value={birthDate}
                onChange={(e) => setBirthDate(e.currentTarget.value)}
                inputMode="numeric"
                /* 🚫 No parsing on the page — an input MASK only. The server runs the chat's own parser. */
                maxLength={10}
              />
              <TextInput
                label={t("register.provinceLabel")}
                placeholder={t("register.provincePlaceholder")}
                value={province}
                onChange={(e) => setProvince(e.currentTarget.value)}
              />
              <Button disabled={!name.trim()} onClick={() => setPhase({ kind: "confirm" })}>
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
                <ReviewRow label={t("register.reviewBirthDate")} value={birthDate.trim() || t("register.reviewSkipped")} />
                <ReviewRow label={t("register.reviewProvince")} value={province.trim() || t("register.reviewSkipped")} />
              </div>
              <Text fz="sm">{t("register.confirmQuestion")}</Text>
              <Button loading={busy} onClick={submitCreate}>
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
  );
}

/** One rendering per NAMED CODE — the words for a decision the server made. 🚫 Never a server `message`. */
function FailureAlert({ failure }: { failure: Failure }) {
  const t = useT();
  const text =
    failure.code === "UNREACHABLE"
      ? t("register.connectFail")
      : t(`register.code.${failure.code}`, { word: failure.word ?? "", max: failure.max ?? "", name: failure.name ?? "" });
  return (
    <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
      {text}
    </Alert>
  );
}

function ChildList({ children }: { children: ChildRef[] }) {
  return (
    <ul className="rounded-lg bg-muted-100 p-3 text-sm">
      {children.map((c) => (
        <li key={c.id} className="py-0.5">
          {c.nickname ? `${c.name} (${c.nickname})` : c.name}
        </li>
      ))}
    </ul>
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
