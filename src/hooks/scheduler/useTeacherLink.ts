"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listTeacherLinkRequests,
  approveTeacherLinkRequest,
  rejectTeacherLinkRequest,
  unlinkTeacherLine,
  type LinkRequestStatus,
} from "@/services/teacher-link.service";
import { TEACHERS_KEY } from "./useScheduler";
import { ATTENTION_KEY } from "./useAttention";

export const LINK_REQUESTS_KEY = ["teacher-link-requests"] as const;

export const useTeacherLinkRequests = (status: LinkRequestStatus = "PENDING") =>
  useQuery({
    queryKey: [...LINK_REQUESTS_KEY, status],
    queryFn: () => listTeacherLinkRequests(status),
  });

// A decision changes the queue, the teacher's linked state, and the 9th attention check — refresh all three
// so the pending count staff act on can't disagree with the list they just emptied.
const invalidateLinkState = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: LINK_REQUESTS_KEY });
  qc.invalidateQueries({ queryKey: TEACHERS_KEY });
  qc.invalidateQueries({ queryKey: ATTENTION_KEY });
};

export const useApproveLinkRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, teacherId }: { id: string; teacherId?: string }) =>
      approveTeacherLinkRequest(id, teacherId),
    onSuccess: () => invalidateLinkState(qc),
  });
};

export const useRejectLinkRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectTeacherLinkRequest(id),
    onSuccess: () => invalidateLinkState(qc),
  });
};

export const useUnlinkTeacherLine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teacherId: string) => unlinkTeacherLine(teacherId),
    onSuccess: () => invalidateLinkState(qc),
  });
};
