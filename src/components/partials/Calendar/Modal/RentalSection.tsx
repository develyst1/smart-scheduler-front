"use client";

import { useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { AlertTriangle, PackageOpen, Trash2 } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useConfirm } from "@/components/common/useConfirm";
import { usePayBookingRental, useRecordBookingRental, useRemoveBookingRental } from "@/hooks/scheduler";
import RentalTierPicker, { rentalPrintLine, useRentalPrices } from "@/components/partials/Rental/RentalTierPicker";
import { OFF_CALENDAR_STATUSES, type Booking } from "@/types/app/scheduler";

export { rentalPrintLine };

/**
 * REQ-091 (TASK-372) — the per-session RENTAL section on the booking modal.
 *
 * Three doors, one row: **add** (tier + remark ⇒ the row, UNPAID) · **mark paid** (two taps — it posts money) ·
 * **remove** (offered only while unpaid). 🔴 Every rule is the server's and arrives as a named code shown as its
 * sentence: the remark for Full Set / Ride only (`RENTAL_REMARK_REQUIRED`), live-only (`BOOKING_NOT_LIVE`), one row
 * per session (`RENTAL_EXISTS`), no removal once paid (`RENTAL_PAID`), and a failed post (`RENTAL_NOT_POSTED` — the
 * row stays unpaid and the button stays live, so the press is simply retried). 🚫 Nothing here decides which tier
 * needs a remark, and nothing reads the ledger.
 *
 * Prices are the server's `rentalItems` (the same source `RentalModal` reads — never a second FE copy); the tier
 * WORDS are the customer's. The print line is their shape: `Rent 200 / Full Set (inline skate size 18-19 CM)`.
 */
export default function RentalSection({ booking }: { booking: Booking }) {
  const t = useT();
  const record = useRecordBookingRental();
  const pay = usePayBookingRental();
  const remove = useRemoveBookingRental();
  const { confirm: askConfirm, confirmDialog } = useConfirm();
  const priceOf = useRentalPrices();
  // TASK-374 §2(a) — a CANCELLED/PAUSED session is offered no `Add rental`: the server refuses it (`BOOKING_NOT_LIVE`,
  // its `rentalBookingLive` = not in CALENDAR_HIDDEN_STATUSES), and this is the FE half of the same rule, read off
  // the ONE literal both grids already use (`OFF_CALENDAR_STATUSES` = CANCELLED · PAUSED). An ATTENDED session still
  // accepts one, on both sides. An existing row still renders and can be marked paid on a cancelled session.
  const canAdd = !OFF_CALENDAR_STATUSES.includes(booking.status);

  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [remark, setRemark] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rental = booking.rental ?? null;
  const busy = record.isPending || pay.isPending || remove.isPending;

  const fail = (e: unknown) => setError(e instanceof ApiClientError ? e.message : (e as Error).message);

  const submitAdd = async () => {
    if (!code) return;
    setError(null);
    try {
      // The remark rides only when typed; whether it is REQUIRED for this tier is the server's answer.
      await record.mutateAsync({ bookingId: booking.id, code, remark: remark.trim() || undefined });
      notify({ title: t("rental.savedOk"), color: "success" });
      setAdding(false);
      setCode(null);
      setRemark("");
    } catch (e) {
      fail(e);
    }
  };

  /** Two taps: the button, then the confirm naming the line that will be posted — it moves money. */
  const submitPaid = async () => {
    if (!rental) return;
    const line = rentalPrintLine(t, rental.code, rental.remark, priceOf(rental.code));
    if (
      !(await askConfirm({
        title: t("rental.markPaidTitle"),
        message: t("rental.markPaidBody", { line }),
        confirmLabel: t("rental.markPaidConfirm"),
        color: "green",
      }))
    )
      return;
    setError(null);
    try {
      await pay.mutateAsync(booking.id);
      notify({ title: t("rental.paidOk"), color: "success" });
    } catch (e) {
      // `RENTAL_NOT_POSTED` (502) lands here: the row is still unpaid, the button is still live — retry.
      fail(e);
    }
  };

  const submitRemove = async () => {
    setError(null);
    try {
      await remove.mutateAsync(booking.id);
      notify({ title: t("rental.removedOk"), color: "success" });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-500">{t("rental.section")}</span>
      {error && (
        <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
          {error}
        </Alert>
      )}

      {rental ? (
        <Stack gap="xs">
          {/* The customer's print shape, and the chip's state in words. */}
          <Text size="sm" className="tabular-nums">
            {rentalPrintLine(t, rental.code, rental.remark, priceOf(rental.code))}
            {" · "}
            <span className={rental.paid ? "font-medium text-green-700" : "font-medium text-red-600"}>
              {rental.paid ? t("rental.paidState") : t("rental.unpaidState")}
            </span>
          </Text>
          {!rental.paid && (
            <Group gap="xs">
              <Button size="xs" color="green" loading={pay.isPending} disabled={busy && !pay.isPending} onClick={submitPaid}>
                {t("rental.markPaid")}
              </Button>
              {/* Remove is offered ONLY while unpaid — the server refuses a paid row (`RENTAL_PAID`) either way. */}
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<Trash2 size={14} />}
                loading={remove.isPending}
                disabled={busy && !remove.isPending}
                onClick={submitRemove}
              >
                {t("rental.remove")}
              </Button>
            </Group>
          )}
        </Stack>
      ) : adding ? (
        <Stack gap="xs">
          <RentalTierPicker code={code} remark={remark} onCode={setCode} onRemark={setRemark} />
          <Group gap="xs">
            <Button size="xs" loading={record.isPending} disabled={!code} onClick={submitAdd}>
              {t("rental.save")}
            </Button>
            <Button size="xs" variant="subtle" color="gray" disabled={record.isPending} onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </Button>
          </Group>
        </Stack>
      ) : canAdd ? (
        <Button
          size="xs"
          variant="light"
          leftSection={<PackageOpen size={14} />}
          className="self-start"
          onClick={() => {
            setError(null);
            setAdding(true);
          }}
        >
          {t("rental.addonBtn")}
        </Button>
      ) : null}
      {confirmDialog}
    </div>
  );
}
