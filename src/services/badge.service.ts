import { api } from "@/lib/api/client";
import type { BadgeType, BadgeValue, BookingBadge } from "@/types/app/scheduler";
import type {
  BadgesResponse,
  BadgeReportResponse,
  BadgeTypeDTO,
  BadgeValueDTO,
  SetBookingBadgesResponse,
} from "@/types/api/contract";

// The badge DTOs are already app-shaped (id/typeId/label/color/active/sortOrder),
// so we can pass them straight through as the app model.

export async function getBadges(includeInactive = false): Promise<BadgeType[]> {
  const { data } = await api.get<BadgesResponse>("/badges", {
    params: includeInactive ? { includeInactive: "true" } : {},
  });
  return data as BadgeType[];
}

export async function createBadgeType(input: {
  name: string;
  sortOrder?: number;
}): Promise<BadgeType> {
  const { data } = await api.post<BadgeTypeDTO>("/badges/types", input);
  return data as BadgeType;
}

export async function updateBadgeType(
  id: string,
  patch: Partial<{ name: string; active: boolean; sortOrder: number }>,
): Promise<BadgeType> {
  const { data } = await api.patch<BadgeTypeDTO>(`/badges/types/${id}`, patch);
  return data as BadgeType;
}

export async function createBadgeValue(input: {
  badgeTypeId: string;
  label: string;
  color: string;
  sortOrder?: number;
}): Promise<BadgeValue> {
  const { data } = await api.post<BadgeValueDTO>("/badges/values", input);
  return data as BadgeValue;
}

export async function updateBadgeValue(
  id: string,
  patch: Partial<{ label: string; color: string; active: boolean; sortOrder: number }>,
): Promise<BadgeValue> {
  const { data } = await api.patch<BadgeValueDTO>(`/badges/values/${id}`, patch);
  return data as BadgeValue;
}

export async function setBookingBadges(
  bookingId: string,
  badgeValueIds: string[],
): Promise<BookingBadge[]> {
  const { data } = await api.patch<SetBookingBadgesResponse>(
    `/bookings/${bookingId}/badges`,
    { badgeValueIds },
  );
  return data.badges;
}

export async function getBadgeReport(from: string, to: string): Promise<BadgeReportResponse> {
  const { data } = await api.get<BadgeReportResponse>("/badges/report", {
    params: { from, to },
  });
  return data;
}
