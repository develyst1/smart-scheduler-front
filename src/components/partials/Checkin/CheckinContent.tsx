"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Loader, Paper, Title } from "@mantine/core";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n";

// Public check-in flow (C.1) — no auth. The `token` query param is the credential,
// so we call the backend directly (bypassing the axios client that attaches a JWT
// and bounces to /login on 401). Endpoint: POST {API}/checkin  (public).

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001/api";

interface BookingRef {
  student?: { name?: string };
  subject?: { name?: string };
  teacher?: { nickname?: string };
  date?: string;
  startTime?: string;
  endTime?: string;
}

interface CheckinResult {
  already: boolean;
  booking: BookingRef | null;
  crmAwarded?: number;
}

type Phase =
  | { kind: "loading" }
  | { kind: "success"; result: CheckinResult }
  | { kind: "error"; message: string };

export default function CheckinContent() {
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
      const res = await fetch(`${API_BASE}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data?.error?.message ?? t("checkin.cannotNow");
        setPhase({ kind: "error", message });
        return;
      }
      setPhase({ kind: "success", result: data as CheckinResult });
    } catch {
      setPhase({ kind: "error", message: t("checkin.connectFail") });
    }
  }, [token, t]);

  useEffect(() => {
    void submit();
  }, [submit]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] p-4">
      <Paper withBorder shadow="sm" radius="lg" p="xl" className="w-full max-w-sm">
        {phase.kind === "loading" && <LoadingView />}
        {phase.kind === "success" && <SuccessView result={phase.result} />}
        {phase.kind === "error" && <ErrorView message={phase.message} onRetry={submit} />}
      </Paper>
    </div>
  );
}

function LoadingView() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Loader />
      <p className="text-sm text-default-500">{t("checkin.loading")}</p>
    </div>
  );
}

function SuccessView({ result }: { result: CheckinResult }) {
  const t = useT();
  const b = result.booking;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 size={32} />
      </span>
      <Title order={3}>{result.already ? t("checkin.alreadyTitle") : t("checkin.successTitle")}</Title>
      {b && (
        <div className="w-full rounded-lg bg-default-100 p-4 text-left text-sm">
          {b.student?.name && <BookingLine label={t("checkin.student")} value={b.student.name} />}
          {b.subject?.name && <BookingLine label={t("checkin.subject")} value={b.subject.name} />}
          {b.teacher?.nickname && <BookingLine label={t("checkin.teacher")} value={b.teacher.nickname} />}
          {(b.startTime || b.date) && (
            <BookingLine
              label={t("checkin.time")}
              value={[b.date, b.startTime && `${b.startTime}–${b.endTime ?? ""}${t("checkin.timeSuffix")}`]
                .filter(Boolean)
                .join("  ")}
            />
          )}
        </div>
      )}
      {!result.already && result.crmAwarded ? (
        <p className="text-sm text-success">{t("checkin.pointsAwarded", { n: result.crmAwarded })}</p>
      ) : null}
      <p className="mt-1 text-xs text-default-400">{t("checkin.closeHint")}</p>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  const isWindow =
    message.includes("เช็คอินได้") || message.includes("หมดอายุ") || /check in|expired/i.test(message);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        {isWindow ? <Clock3 size={32} /> : <XCircle size={32} />}
      </span>
      <Title order={3}>{t("checkin.failTitle")}</Title>
      <p className="text-sm text-default-600">{message}</p>
      <Button variant="light" onClick={onRetry} mt="xs">
        {t("checkin.retry")}
      </Button>
    </div>
  );
}

function BookingLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-default-500">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
