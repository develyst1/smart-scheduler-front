import { api } from "@/lib/api/client";
import type { StudentsResponse } from "@/types/api/contract";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

/** Booking dropdown source — students searchable by name / nickname / parent phone. */
export const searchStudents = async (q?: string, limit = 50): Promise<StudentsResponse> => {
  if (useMock) return [];
  const { data } = await api.get<StudentsResponse>("/students", {
    params: { ...(q ? { q } : {}), limit },
  });
  return data;
};
