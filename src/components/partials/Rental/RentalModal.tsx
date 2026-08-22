"use client";

import { useEffect, useState } from "react";
import { Modal, Stack, Select, NumberInput, Button, Group, Alert, Text } from "@mantine/core";
import { PackageOpen, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { useRecordRental, useSellablePackages } from "@/hooks/scheduler";
import { ApiClientError, errorProblems } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { RENTAL_CODES, type RentalCode, type RentalResult } from "@/types/app/scheduler";
import { formatPriceMinor } from "@/types/app/pricing";
import DiscountSection from "@/components/common/DiscountSection";
import { discountPayload, emptyDiscount, evaluateDiscount, type DiscountDraft } from "@/lib/scheduler/discount";

/**
 * Record an equipment rental (SPEC-031 / TASK-109). One modal, both surfaces:
 * - `refId` present → session add-on (idempotent on booking+code, no client key needed).
 * - `refId` absent  → standalone walk-in; a fresh `idempotencyKey` is minted per open so a double-submit posts once.
 */
export default function RentalModal({
  opened,
  onClose,
  refId,
  contextName,
}: {
  opened: boolean;
  onClose: () => void;
  refId?: string;
  contextName?: string;
}) {
  const t = useT();
  const record = useRecordRental();
  // TASK-123 — rental prices come from the server's `rentalItems` (never a second FE copy); labels stay FE i18n.
  const { data: card } = useSellablePackages();
  const priceOf = (c: string) => card?.rentalItems.find((r) => r.code === c)?.priceMinor;

  const [code, setCode] = useState<RentalCode | null>(null);
  const [hours, setHours] = useState<number>(1);
  const [result, setResult] = useState<RentalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A standalone rental has no natural key → one key per action (AC #4). Regenerated each time the modal opens.
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  // REQ-063 / AC-14 — a rental's full price is hours × rate, so it re-computes whenever either changes.
  const [discount, setDiscount] = useState<DiscountDraft>(emptyDiscount());
  const [discountProblems, setDiscountProblems] = useState<string[]>([]);

  useEffect(() => {
    if (opened) {
      setCode(null);
      setHours(1);
      setResult(null);
      setError(null);
      setDiscount(emptyDiscount());
      setDiscountProblems([]);
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [opened]);

  const fullMinor = code && priceOf(code) != null ? (priceOf(code) as number) * hours : 0;
  const discountEval = evaluateDiscount(discount, fullMinor);

  const submit = async () => {
    if (!code || hours < 1 || discountEval.problemKeys.length) return;
    setError(null);
    setDiscountProblems([]);
    try {
      const res = await record.mutateAsync({
        code,
        hours,
        refId,
        // only the standalone path needs the client key; the add-on is already idempotent on refId+code
        idempotencyKey: refId ? undefined : idempotencyKey,
        discount: discountPayload(discount, fullMinor),
      });
      setResult(res);
    } catch (e) {
      // RENTAL_NOT_POSTED (502) or any API error — surfaced, never a silent dead button.
      // REQ-063: a DISCOUNT_REFUSED carries an ARRAY of reasons — show every one, or staff fix the first and
      // resubmit straight into the second.
      setDiscountProblems(errorProblems(e));
      setError(e instanceof ApiClientError ? e.message : t("rental.errorGeneric"));
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setCode(null);
    setHours(1);
    setIdempotencyKey(crypto.randomUUID());
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={
        <span className="flex items-center gap-2 font-semibold">
          <PackageOpen size={18} />
          {t(refId ? "rental.addonTitle" : "rental.standaloneTitle")}
        </span>
      }
    >
      <Stack gap="md">
        {contextName && (
          <Text size="sm" c="dimmed">
            {t("rental.forStudent", { name: contextName })}
          </Text>
        )}

        {result ? (
          <>
            <Alert
              color={result.status === "duplicate" ? "yellow" : "green"}
              icon={result.status === "duplicate" ? <Info size={16} /> : <CheckCircle2 size={16} />}
              variant="light"
            >
              {t(result.status === "duplicate" ? "rental.duplicate" : "rental.recorded")}
            </Alert>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={reset}>
                {t("rental.another")}
              </Button>
              <Button onClick={onClose}>{t("rental.close")}</Button>
            </Group>
          </>
        ) : (
          <>
            {error && (
              <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
                {error}
              </Alert>
            )}
            <Select
              label={t("rental.item")}
              placeholder={t("rental.pickItem")}
              data={RENTAL_CODES.map((c) => {
                const label = t(`rental.item${c.charAt(0).toUpperCase()}${c.slice(1)}`);
                const p = priceOf(c);
                return { value: c, label: p != null ? `${label} · ฿${formatPriceMinor(p)}` : label };
              })}
              value={code}
              onChange={(v) => setCode(v as RentalCode | null)}
              allowDeselect={false}
              required
            />
            <NumberInput
              label={t("rental.hours")}
              value={hours}
              onChange={(v) => setHours(typeof v === "number" ? v : 0)}
              min={1}
              step={1}
              allowDecimal={false}
              suffix={t("rental.hoursSuffix")}
              required
            />
            {code && priceOf(code) != null && hours >= 1 && (
              <Text size="sm" ta="right" c="dimmed">
                {t("rental.total")}:{" "}
                <strong className="text-muted-700">
                  ฿{formatPriceMinor((priceOf(code) as number) * hours)}
                </strong>
              </Text>
            )}
            {code && priceOf(code) != null && (
              <DiscountSection
                fullMinor={fullMinor}
                value={discount}
                onChange={setDiscount}
                serverProblems={discountProblems}
              />
            )}
            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" color="gray" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                loading={record.isPending}
                disabled={!code || hours < 1 || discountEval.problemKeys.length > 0}
                onClick={submit}
              >
                {t("rental.record")}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
