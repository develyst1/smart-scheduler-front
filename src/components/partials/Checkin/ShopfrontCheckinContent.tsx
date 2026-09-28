"use client";

import { useState } from "react";
import { Button, Checkbox, Loader, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { AlertTriangle, ArrowLeft, CheckCircle2, Phone, Tent } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";
import { API_BASE, CampSuccessView, SuccessView, type CheckinResult } from "./CheckinContent";
import {
  MAX_BATCH,
  batchBody,
  batchHeadlineKey,
  batchSummary,
  canLookup,
  canSubmitBatch,
  checkinBody,
  isNothingToOffer,
  itemKey,
  offerRows,
  overMax,
  pairRows,
  rowOutcome,
  rowReason,
  type BatchRow,
  type ShopfrontItem,
  type ShopfrontLookup,
} from "@/lib/checkin/shopfront";
import type { CampCheckinResult } from "@/types/api/contract";

/**
 * REQ-108 (TASK-475/478) — the SHOP-FRONT check-in, at the printed URL `/checkin/shop`. Three steps: the phone, the
 * child's class, checked in. No login, **no token**, nothing stored (see `lib/checkin/shopfront.ts` for why the path
 * is frozen and why the phone is the credential).
 *
 * 🔴 **Step 2 is the guard.** An unknown number, a family with nothing right now, and a suspended household are
 * indistinguishable on the server — one shape, one timing — and this page must not undo that: all three land on the
 * SAME neutral sentence, with NO names, NO count, and the SAME controls (`isNothingToOffer`, pure). There is no
 * "not found", no second message for an empty list versus an absent one, and no retry that fires in only one case.
 *
 * 🔴 **The reply is not re-implemented:** a successful check-in renders `SuccessView` / `CampSuccessView` — the very
 * components `/checkin` and `/checkin/camp` use, remaining line and all. A `429` and a `409 NOT_CHECKINABLE` are
 * neutral: try again shortly, or ask the front desk — never a technical word, never a hint about the number.
 *
 * Public, so it calls the API directly (the axios client attaches a JWT and bounces to /login on 401).
 */
type Asked = { child: string; item: ShopfrontItem };
type Phase =
  | { kind: "phone" }
  | { kind: "looking" }
  | { kind: "list"; data: ShopfrontLookup }
  | { kind: "nothing" }
  | { kind: "checking" }
  | { kind: "done"; result: CheckinResult }
  | { kind: "doneCamp"; result: CampCheckinResult }
  /** TASK-491 — several children: ONE row per child, in the order asked, each decided from its OWN row. */
  | { kind: "batch"; asked: Asked[]; rows: BatchRow[] };

export default function ShopfrontCheckinContent() {
  const t = useT();
  // 🚫 Never persisted and never autofilled — a counter device is shared by every family that walks in.
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "phone" });
  /** The ticked rows, by item id. 🚫 Never persisted — a counter device is shared. */
  const [ticked, setTicked] = useState<string[]>([]);
  /** ONE neutral line for every refusal — a 429, a 409, a dead network. It never names a cause. */
  const [notice, setNotice] = useState<string | null>(null);

  const backToStart = () => {
    setPhone("");
    setNotice(null);
    setTicked([]);
    setPhase({ kind: "phone" });
  };

  const lookup = async (keepNotice = false) => {
    if (!canLookup(phone)) return;
    if (!keepNotice) setNotice(null);
    setPhase({ kind: "looking" });
    try {
      const res = await fetch(`${API_BASE}/checkin/shopfront/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // 🔴 Every failure is the same neutral sentence: a 429, a 400 (not phone-shaped) and a 500 must not be told
        // apart on this screen either — "how did it fail" is a hint about the number.
        setNotice(t("shopCheckin.tryAgain"));
        setPhase({ kind: "phone" });
        return;
      }
      // 🔴 The four "nothing" cases meet here, all of them: one phase, one sentence, no names.
      setTicked([]);
      if (isNothingToOffer(data as ShopfrontLookup)) setPhase({ kind: "nothing" });
      else setPhase({ kind: "list", data: data as ShopfrontLookup });
    } catch {
      setNotice(t("shopCheckin.tryAgain"));
      setPhase({ kind: "phone" });
    }
  };

  const checkIn = async (item: ShopfrontItem) => {
    setNotice(null);
    setPhase({ kind: "checking" });
    try {
      const res = await fetch(`${API_BASE}/checkin/shopfront`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkinBody(phone, item)),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // A 409 NOT_CHECKINABLE happens at the door (it stopped being check-in-able between the two steps) and a 429
        // happens under load: both ⇒ the neutral line, then back to a REFRESHED list — never a technical code.
        setNotice(t("shopCheckin.tryAgain"));
        await lookup(true);
        return;
      }
      if (item.kind === "camp") setPhase({ kind: "doneCamp", result: data as CampCheckinResult });
      else setPhase({ kind: "done", result: data as CheckinResult });
      // 🚫 The number is cleared the moment it is no longer needed: the next family must not meet it.
      setPhone("");
    } catch {
      setNotice(t("shopCheckin.tryAgain"));
      await lookup(true);
    }
  };

  /**
   * TASK-491 — several children, one press. 🔴 **The request's 200 means "the list was read".** Every child is decided
   * from its OWN row (`rowOutcome`), and the screen shows one row per child in the order asked — never one tick for the
   * batch, never all-or-nothing. A SINGLE ticked child goes down today's single route unchanged: one child, one
   * behaviour, and the familiar full reply (`SuccessView` / `CampSuccessView`) rather than a compact row.
   */
  const checkInMany = async (asked: Asked[]) => {
    if (!canSubmitBatch(asked.length)) return;
    if (asked.length === 1) return checkIn(asked[0].item);
    setNotice(null);
    setPhase({ kind: "checking" });
    try {
      const res = await fetch(`${API_BASE}/checkin/shopfront/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batchBody(phone, asked.map((a) => a.item))),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray((data as { results?: BatchRow[] })?.results)) {
        // The whole call failed (429, a dead network): the same neutral line as everywhere, then a REFRESHED list.
        setNotice(t("shopCheckin.tryAgain"));
        await lookup(true);
        return;
      }
      setPhase({ kind: "batch", asked, rows: (data as { results: BatchRow[] }).results });
      // 🚫 The number is cleared the moment it is no longer needed: the next family must not meet it.
      setPhone("");
      setTicked([]);
    } catch {
      setNotice(t("shopCheckin.tryAgain"));
      await lookup(true);
    }
  };

  const rows = phase.kind === "list" ? offerRows(phase.data) : [];
  const tickedRows = rows.filter((r) => ticked.includes(itemKey(r.item)));

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Paper withBorder shadow="sm" radius="lg" p="xl" className="w-full max-w-sm" data-shop-checkin={phase.kind}>
        <Stack gap="md">
          <Title order={3} ta="center">
            {t("shopCheckin.title")}
          </Title>

          {notice && (
            <Text size="sm" ta="center" c="dimmed" data-shop-notice>
              {notice}
            </Text>
          )}

          {(phase.kind === "phone" || phase.kind === "looking") && (
            <>
              <Text size="sm" c="dimmed" ta="center">
                {t("shopCheckin.phoneHint")}
              </Text>
              <TextInput
                size="md"
                inputMode="tel"
                autoComplete="off"
                name="shopfront-phone"
                label={t("shopCheckin.phoneLabel")}
                leftSection={<Phone size={16} />}
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void lookup();
                }}
                disabled={phase.kind === "looking"}
              />
              <Button size="md" fullWidth loading={phase.kind === "looking"} disabled={!canLookup(phone)} onClick={() => void lookup()}>
                {t("shopCheckin.findBtn")}
              </Button>
            </>
          )}

          {/* 🔴 The ONE neutral outcome: unknown number · nothing right now · suspended family — identical here. */}
          {phase.kind === "nothing" && (
            <Stack gap="md" data-shop-nothing>
              <Text size="sm" ta="center">
                {t("shopCheckin.nothing")}
              </Text>
              <Button size="md" fullWidth variant="light" leftSection={<ArrowLeft size={16} />} onClick={backToStart}>
                {t("shopCheckin.startOver")}
              </Button>
            </Stack>
          )}

          {phase.kind === "list" && (
            <Stack gap="xs">
              <Text size="sm" c="dimmed" ta="center">
                {t("shopCheckin.pickHint")}
              </Text>
              {rows.map(({ child, item }) => (
                <label
                  key={itemKey(item)}
                  className="flex min-h-[56px] cursor-pointer items-start gap-2 rounded-lg border border-muted-200 bg-muted-50 px-3 py-2 text-left hover:bg-muted-100"
                  data-shop-row={itemKey(item)}
                >
                  <Checkbox
                    size="md"
                    checked={ticked.includes(itemKey(item))}
                    // 🔴 TASK-554 (Tanya's D7) — **the value is read EAGERLY, in the handler body.** It used to be read
                    // INSIDE the `setTicked` updater, which React may run later, during the render it schedules — by
                    // which time `currentTarget` is null and the page dies with *"Cannot read properties of null"*.
                    // 🔑 The first tick usually survives (`dispatchSetState`'s eager path runs the updater inline, while
                    // the event is still alive) and the SECOND one kills the page ⇒ it breaks on exactly what a parent
                    // with two children does, at a counter with no staff nearby.
                    // 📌 This is TASK-237's defect returning — `lib/scheduler/other-booking.ts` documents the mechanism
                    // and states the rule. 🚫 `e.currentTarget?.checked` would NOT be the fix: it stops the crash and
                    // silently records the wrong thing, and a tick that quietly does nothing is worse than a stack trace.
                    onChange={(e) => {
                      const on = e.currentTarget.checked;
                      setTicked((prev) => (on ? [...prev, itemKey(item)] : prev.filter((k) => k !== itemKey(item))));
                    }}
                    aria-label={child}
                    data-shop-tick={itemKey(item)}
                  />
                  <div className="min-w-0">
                  <Text size="sm" fw={600}>
                    {child}
                  </Text>
                  <Text size="xs" c="dimmed" className="tabular-nums">
                    {item.kind === "camp" ? (
                      <>
                        <Tent size={11} className="mr-1 inline" aria-hidden />
                        {formatDateDisplay(item.date)} · {item.half === "FULL" ? t("camp.halfFull") : item.half}
                      </>
                    ) : (
                      <>
                        {formatDateDisplay(item.date)} · {formatTimeDisplay(item.startTime)}–{formatTimeDisplay(item.endTime)} · {item.program} · {item.teacher}
                      </>
                    )}
                  </Text>
                  </div>
                </label>
              ))}
              {/* The server's ceiling, surfaced kindly BEFORE the request: the button waits rather than the call failing. */}
              {overMax(tickedRows.length) && (
                <Text size="xs" c="dimmed" ta="center" data-shop-max>
                  {t("shopCheckin.tooMany", { max: MAX_BATCH })}
                </Text>
              )}
              <Button size="md" fullWidth disabled={!canSubmitBatch(tickedRows.length)} onClick={() => void checkInMany(tickedRows)} data-shop-submit>
                {t("shopCheckin.checkInBtn", { n: tickedRows.length })}
              </Button>
              <Button size="sm" fullWidth variant="subtle" color="gray" leftSection={<ArrowLeft size={14} />} onClick={backToStart}>
                {t("shopCheckin.startOver")}
              </Button>
            </Stack>
          )}

          {phase.kind === "checking" && (
            <Stack align="center" gap="xs" py="md">
              <Loader />
              <Text size="sm" c="dimmed">
                {t("checkin.loading")}
              </Text>
            </Stack>
          )}

          {/* The SAME reply rendering the other two check-in pages use — never a second one. */}
          {/* 🔴 TASK-491 — the MIXED result is the design: one row per child, in the order asked, each from its OWN
              row. A success headline appears only when EVERY child is in; otherwise the headline is neutral and says how
              many need attention, because a parent told "checked in" walks away believing all of them are. */}
          {phase.kind === "batch" && (
            <Stack gap="xs" data-shop-batch={batchSummary(phase.rows).anyRefused ? "mixed" : "all-in"}>
              <Text fw={600} ta="center">
                {t(batchHeadlineKey(phase.rows), { in: batchSummary(phase.rows).in, total: batchSummary(phase.rows).total, refused: batchSummary(phase.rows).refused })}
              </Text>
              {pairRows(phase.asked, phase.rows).map(({ child, item, row }) => {
                // A row the server did not answer for is not a success: it is refused, like any other unconfirmed child.
                const outcome = row ? rowOutcome(row) : "refused";
                const reason = row ? rowReason(row) : null;
                return (
                  <div
                    key={itemKey(item)}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${outcome === "refused" ? "border-orange-300 bg-orange-50" : "border-muted-200 bg-muted-50"}`}
                    data-shop-result={itemKey(item)}
                    data-outcome={outcome}
                  >
                    {outcome === "refused" ? (
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-orange-700" aria-hidden />
                    ) : (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <Text size="sm" fw={600}>
                        {child}
                      </Text>
                      <Text size="xs" c={outcome === "refused" ? "orange.9" : "dimmed"}>
                        {outcome === "refused" ? (reason ?? t("shopCheckin.rowRefused")) : t(outcome === "already" ? "shopCheckin.rowAlready" : "shopCheckin.rowDone")}
                      </Text>
                    </div>
                  </div>
                );
              })}
              {/* What to do about the ones that are not in — the counter, not a retry-all that re-submits the successes. */}
              {batchSummary(phase.rows).anyRefused && (
                <Text size="xs" c="dimmed" ta="center" data-shop-ask-desk>
                  {t("shopCheckin.askDesk")}
                </Text>
              )}
              <Button size="md" fullWidth variant="light" onClick={backToStart}>
                {t("shopCheckin.nextFamily")}
              </Button>
            </Stack>
          )}

          {phase.kind === "done" && (
            <Stack gap="md">
              <SuccessView result={phase.result} />
              <Button size="md" fullWidth variant="light" onClick={backToStart}>
                {t("shopCheckin.nextFamily")}
              </Button>
            </Stack>
          )}
          {phase.kind === "doneCamp" && (
            <Stack gap="md">
              <CampSuccessView result={phase.result} />
              <Button size="md" fullWidth variant="light" onClick={backToStart}>
                {t("shopCheckin.nextFamily")}
              </Button>
            </Stack>
          )}
        </Stack>
      </Paper>
    </div>
  );
}
