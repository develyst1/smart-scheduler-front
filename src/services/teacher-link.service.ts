// Teacher LINE-link approval queue — REQ-020 Stage 2 / SPEC-023 (TASK-076).
// The only place that talks to the API for the link queue. API JSON already matches the app shapes.
import { api, useMockData } from "@/lib/api/client";
import type { TeacherLinkRequest, TeacherLinkRequestsResponse } from "@/types/app/teacher-link";
import * as mock from "./teacher-link.mock.service";

export type LinkRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export const listTeacherLinkRequests = async (
  status: LinkRequestStatus = "PENDING",
): Promise<TeacherLinkRequest[]> => {
  if (useMockData) return mock.listTeacherLinkRequests(status);
  const { data } = await api.get<TeacherLinkRequestsResponse>("/teacher-link-requests", {
    params: { status },
  });
  return data.items;
};

/**
 * Approve — **the only action that grants a link**. `teacherId` is required by the server when the request
 * carries none (a collision); the UI must not let staff reach here without one.
 */
export const approveTeacherLinkRequest = async (id: string, teacherId?: string): Promise<void> => {
  if (useMockData) return mock.approveTeacherLinkRequest(id, teacherId);
  await api.post(`/teacher-link-requests/${id}/approve`, teacherId ? { teacherId } : {});
};

export const rejectTeacherLinkRequest = async (id: string): Promise<void> => {
  if (useMockData) return mock.rejectTeacherLinkRequest(id);
  await api.post(`/teacher-link-requests/${id}/reject`, {});
};

/** Unlink a teacher's LINE account — a departed teacher otherwise keeps receiving schedule pushes forever. */
export const unlinkTeacherLine = async (teacherId: string): Promise<void> => {
  if (useMockData) return mock.unlinkTeacherLine(teacherId);
  await api.delete(`/teachers/${teacherId}/line-link`);
};
