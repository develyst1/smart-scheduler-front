"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listParents,
  getParent,
  clearParentLineLink,
  createParent,
  updateParent,
  createStudentForParent,
  updateStudent,
  deleteStudent,
  archiveStudent,
  unarchiveStudent,
  archiveParent,
  unarchiveParent,
  setParentSuspended,
  type ParentsQuery,
  type ParentInput,
  type CreateStudentInput,
  type UpdateStudentInput,
} from "@/services/people.service";

export const PARENTS_KEY = ["parents"] as const;

export const useParents = (query: ParentsQuery = {}) =>
  useQuery({
    queryKey: [...PARENTS_KEY, query],
    queryFn: () => listParents(query),
    placeholderData: keepPreviousData,
  });

/**
 * SPEC-071 / TASK-243 — one family's detail, including the account count used by the confirmation dialog.
 * `enabled` is the dialog's own `opened`, so the list still issues no per-row detail requests.
 */
export const useParent = (id: string | null, enabled: boolean) =>
  useQuery({
    queryKey: [...PARENTS_KEY, "detail", id],
    queryFn: () => getParent(id as string),
    enabled: enabled && !!id,
    // The admin is about to act on what this says, so it is never served from a previous look.
    staleTime: 0,
  });

/**
 * SPEC-071 / TASK-243 — the staff act. Invalidates the parents cache so the reopened dialog reads the new
 * state rather than the one the admin just changed.
 */
export const useClearParentLineLink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clearParentLineLink(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }),
  });
};

export const useCreateParent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ParentInput) => createParent(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }),
  });
};

export const useUpdateParent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ParentInput> }) => updateParent(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }),
  });
};

export const useCreateStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, input }: { parentId: string; input: CreateStudentInput }) =>
      createStudentForParent(parentId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }),
  });
};

export const useUpdateStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStudentInput }) => updateStudent(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }),
  });
};

/** TASK-365 — after a delete the student leaves the list and the parent's count updates: the SAME invalidation as `useCreateStudent`. */
/** REQ-093 (TASK-393) — archive / restore; both re-read the parents (the split moves a child between the two lists). */
export const useArchiveStudent = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => archiveStudent(id), onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }) });
};
export const useUnarchiveStudent = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => unarchiveStudent(id), onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }) });
};
/** REQ-098 (TASK-412) — the PARENT's two doors; both lists (working + archived) share `PARENTS_KEY`, so both re-read. */
export const useArchiveParent = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => archiveParent(id), onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }) });
};
export const useUnarchiveParent = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => unarchiveParent(id), onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }) });
};
/** The restore view — `GET /parents?archived=1`, fetched ONLY while the `Show archived` toggle is on. */
export const useArchivedParents = (query: ParentsQuery, enabled: boolean) =>
  useQuery({ queryKey: [...PARENTS_KEY, "archived", query], queryFn: () => listParents(query), enabled, placeholderData: keepPreviousData });

export const useDeleteStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteStudent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }),
  });
};

export const useSetParentSuspended = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) => setParentSuspended(id, suspended),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }),
  });
};
