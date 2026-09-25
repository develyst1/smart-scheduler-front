"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Loader, Paper, Title } from "@mantine/core";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";
import { CAMP_TOKEN_EXPIRED, checkinEndpointFor, remainingLine, type CheckinKind } from "@/lib/camp/units";
import type { CampCheckinResult, CheckinRemaining } from "@/types/api/contract";

// Public check-in flow (C.1) — no auth. The `token` query param is the credential,
// so we call the backend directly (bypassing the axios client that attaches a JWT
// and bounces to /login on 401). Endpoint: POST {API}/checkin  (public).
//
// TASK-404 — ONE page, TWO token kinds: the URL path says which (`/checkin` = a session, `/checkin/camp` = a camp
// day ⇒ POST {API}/checkin/camp ⇒ `{ already, day }`). The token never says; the camp's own expiry is `410
// CAMP_TOKEN_EXPIRED` (the session keeps its 400 sentence) — both draw the clock.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001/api";

interface BookingRef {
  student?: { name?: string };
  subject?: { name?: string };
  teacher?: { nickname?: string };
  date?: string;
  startTime?: string;
  endTime?: string;
}

export interface CheckinResult {
  already: boolean;
  booking: BookingRef | null;
  crmAwarded?: number;
  /** REQ-104 §2 item 5a (TASK-443) — a course's sessions or a voucher's hours; `null` on a trial/single. */
  remaining?: CheckinRemaining | null;
}

type Phase =
  | { kind: "loading" }
  | { kind: "success"; result: CheckinResult }
  | { kind: "camp"; result: CampCheckinResult }
  | { kind: "error"; message: string; code?: string };

export default function CheckinContent({ kind = "session" }: { kind?: CheckinKind }) {
  const t = useT();
  const params = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const submit = useCallback(async () => {
    if (!token) {
      setPhase({ kind: "error", message: t("checkin.invalidLink") });
      return;
    }
    setPhase({ kind: "loading" });
    try {
      const res = await fetch(`${API_BASE}${checkinEndpointFor(kind)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data?.error?.message ?? t("checkin.cannotNow");
        setPhase({ kind: "error", message, code: data?.error?.code });
        return;
      }
      if (kind === "camp") setPhase({ kind: "camp", result: data as CampCheckinResult });
      else setPhase({ kind: "success", result: data as CheckinResult });
    } catch {
      setPhase({ kind: "error", message: t("checkin.connectFail") });
    }
  }, [token, t, kind]);

  useEffect(() => {
    void submit();
  }, [submit]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Paper withBorder shadow="sm" radius="lg" p="xl" className="w-full max-w-sm">
        {phase.kind === "loading" && <LoadingView />}
        {phase.kind === "success" && <SuccessView result={phase.result} />}
        {phase.kind === "camp" && <CampSuccessView result={phase.result} />}
        {phase.kind === "error" && <ErrorView message={phase.message} code={phase.code} onRetry={submit} />}
      </Paper>
    </div>
  );
}

function LoadingView() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Loader />
      <p className="text-sm text-muted-500">{t("checkin.loading")}</p>
    </div>
  );
}

// REQ-108 (TASK-478) — exported: the SHOP-FRONT page renders the SAME reply (`already` / the booking / the remaining
// line / a camp day's own shape). One rendering of the check-in answer, never a second that can drift from it.
export function SuccessView({ result }: { result: CheckinResult }) {
  const t = useT();
  const b = result.booking;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 size={32} />
      </span>
      <Title order={3}>{result.already ? t("checkin.alreadyTitle") : t("checkin.successTitle")}</Title>
      {b && (
        <div className="w-full rounded-lg bg-muted-100 p-4 text-left text-sm">
          {b.student?.name && <BookingLine label={t("checkin.student")} value={b.student.name} />}
          {b.subject?.name && <BookingLine label={t("checkin.subject")} value={b.subject.name} />}
          {b.teacher?.nickname && <BookingLine label={t("checkin.teacher")} value={b.teacher.nickname} />}
          {(b.startTime || b.date) && (
            <BookingLine
              label={t("checkin.time")}
              /* 🔴 TASK-326 §1 — **the site that matters most, and it is not one that was broken.** A PUBLIC
                 page on a parent's phone, with its OWN local `BookingRef` type, fetched directly rather than
                 through the shared DTO types ⇒ **the least protected by the mapper that currently makes it
                 correct.** The separator stays local; the helper formats one time.
                 📌 `formatTimeDisplay` also absorbs the `?? ""` — absent → `""` is its contract. */
              value={[b.date, b.startTime && `${formatTimeDisplay(b.startTime)}–${formatTimeDisplay(b.endTime)}${t("checkin.timeSuffix")}`]
                .filter(Boolean)
                .join("  ")}
            />
          )}
        </div>
      )}
      {!result.already && result.crmAwarded ? (
        <p className="text-sm text-success">{t("checkin.pointsAwarded", { n: result.crmAwarded })}</p>
      ) : null}
      <RemainingLine line={result.already ? null : remainingLine({ kind: "session", remaining: result.remaining })} />
      <p className="mt-1 text-xs text-muted-400">{t("checkin.closeHint")}</p>
    </div>
  );
}

/** REQ-104 §2 item 5a (TASK-444) — `Remaining : 3.5/10 days` · `7/10 sessions` · `… hours`, from the response; nothing on `already` or a trial/single. */
function RemainingLine({ line }: { line: { key: string; args: Record<string, number> } | null }) {
  const t = useT();
  if (!line) return null;
  return (
    <p className="text-sm tabular-nums" data-remaining>
      {t("checkin.remaining")} : {t(line.key, line.args)}
    </p>
  );
}

/** TASK-404 — the camp day's shape: date · session · status, and the undone line when a mark was taken back. */
export function CampSuccessView({ result }: { result: CampCheckinResult }) {
  const t = useT();
  const d = result.day;
  return (
    <div className="flex flex-col items-center gap-3 text-center" data-camp-checkin>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 size={32} />
      </span>
      <Title order={3}>{result.already ? t("checkin.alreadyTitle") : t("checkin.successTitle")}</Title>
      <div className="w-full rounded-lg bg-muted-100 p-4 text-left text-sm">
        {d.studentName && <BookingLine label={t("checkin.student")} value={d.studentName} />}
        <BookingLine label={t("checkin.campTitle")} value={d.weekName ?? t("checkin.campTitle")} />
        <BookingLine label={t("checkin.date")} value={formatDateDisplay(d.date)} />
        <BookingLine label={t("checkin.half")} value={d.half === "FULL" ? t("camp.halfFull") : d.half} />
        <BookingLine label={t("checkin.status")} value={t(`camp.status_${d.status}`)} />
      </div>
      {d.undoReason && <p className="text-xs text-muted-500">{t("checkin.undone", { reason: d.undoReason })}</p>}
      <RemainingLine line={result.already ? null : remainingLine({ kind: "camp", credit: result.credit })} />
      <p className="mt-1 text-xs text-muted-400">{t("checkin.closeHint")}</p>
    </div>
  );
}

function ErrorView({ message, code, onRetry }: { message: string; code?: string; onRetry: () => void }) {
  const t = useT();
  const isWindow =
    code === CAMP_TOKEN_EXPIRED || message.includes("เช็คอินได้") || message.includes("หมดอายุ") || /check in|expired/i.test(message);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        {isWindow ? <Clock3 size={32} /> : <XCircle size={32} />}
      </span>
      <Title order={3}>{t("checkin.failTitle")}</Title>
      <p className="text-sm text-muted-600">{message}</p>
      <Button variant="light" onClick={onRetry} mt="xs">
        {t("checkin.retry")}
      </Button>
    </div>
  );
}

function BookingLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-muted-500">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
