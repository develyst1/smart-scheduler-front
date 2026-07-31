"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listParents,
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
