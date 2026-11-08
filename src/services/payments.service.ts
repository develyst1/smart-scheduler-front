// Payment record — SPEC-099 §8.5 / TASK-875 (SB). One function per endpoint.
import { api } from "@/lib/api/client";
import { USE_FAKE_PAYMENTS } from "@/components/partials/Payments/config";
import type {
  CreatePaymentInput,
  ListPaymentsParams,
  Payment,
  PaymentsResult,
  UpdatePaymentInput,
} from "@/types/payments";

// SB mounts its routes at `/api/<name>` and the shared `api` client already ends in `/api`, so this is `/payments`.
// (SPEC-099 §8.5 writes `/api/v1/payments`; one constant, so a change is one line. See TASK-876 §Questions.)
const PATH = "/payments";

// The fake is loaded only when the dev constant is on, so the delivered bundle never carries it.
const fake = () => import("@/components/partials/Payments/fake");

export const listPayments = async (params: ListPaymentsParams): Promise<PaymentsResult> => {
  if (USE_FAKE_PAYMENTS) return (await fake()).fakeListPayments(params);
  const { data } = await api.get<PaymentsResult>(PATH, { params });
  return data;
};

export const createPayment = async (input: CreatePaymentInput): Promise<Payment> => {
  if (USE_FAKE_PAYMENTS) return (await fake()).fakeCreatePayment(input);
  const { data } = await api.post<{ payment: Payment }>(PATH, input);
  return data.payment;
};

export const updatePayment = async (id: string, patch: UpdatePaymentInput): Promise<Payment> => {
  if (USE_FAKE_PAYMENTS) return (await fake()).fakeUpdatePayment(id, patch);
  const { data } = await api.patch<{ payment: Payment }>(`${PATH}/${id}`, patch);
  return data.payment;
};
