"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPayment, listPayments, updatePayment } from "@/services/payments.service";
import type { CreatePaymentInput, PaymentRefType, UpdatePaymentInput } from "@/types/payments";

const key = (refType: PaymentRefType, refId: string) => ["payments", refType, refId] as const;

export function usePayments(refType: PaymentRefType, refId: string, enabled = true) {
  return useQuery({
    queryKey: key(refType, refId),
    queryFn: () => listPayments({ refType, refId }),
    enabled,
  });
}

export function useUpdatePayment(refType: PaymentRefType, refId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: UpdatePaymentInput }) => updatePayment(v.id, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(refType, refId) }),
  });
}

export function useCreatePayment(refType: PaymentRefType, refId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePaymentInput) => createPayment(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(refType, refId) }),
  });
}
