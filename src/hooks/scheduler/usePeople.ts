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
 * SPEC-071 / TASK-243 — one family's detail, incl. its LINE binding. `enabled` is the dialog's own `opened`,
 * so a screen full of parent cards issues **no** extra request until an admin opens one.
 *
 * 🚫 Never call this per row. The BE resolves `lineAccounts` through the family-link accessor (one query each);
 * a badge on every card is a **batched** BE read, not 20 of these.
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

export const useSetParentSuspended = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) => setParentSuspended(id, suspended),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY }),
  });
};
