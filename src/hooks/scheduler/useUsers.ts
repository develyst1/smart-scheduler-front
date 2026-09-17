"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createUser,
  listUsers,
  resetUserPassword,
  setUserDisabled,
  setUserActions,
  setUserMenus,
  updateUser,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/services/users.service";

/** REQ-092 Stage 1 (TASK-378) — the Users page's data. One key; every write invalidates it. */
export const USERS_KEY = ["users"] as const;

export const useUsers = (enabled = true) => useQuery({ queryKey: USERS_KEY, queryFn: listUsers, enabled });

const invalidate = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: USERS_KEY });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateUserInput) => createUser(input), onSuccess: () => invalidate(qc) });
};
export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => updateUser(id, input),
    onSuccess: () => invalidate(qc),
  });
};
export const useResetUserPassword = () =>
  useMutation({ mutationFn: ({ id, password }: { id: string; password: string }) => resetUserPassword(id, password) });
/** Stage 2 — the per-user menu grants (the bridge until Stage 4's roles). */
export const useSetUserMenus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keys }: { id: string; keys: string[] }) => setUserMenus(id, keys),
    onSuccess: () => invalidate(qc),
  });
};
/** Stage 3 — the per-user action grants. */
export const useSetUserActions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keys }: { id: string; keys: string[] }) => setUserActions(id, keys),
    onSuccess: () => invalidate(qc),
  });
};
export const useSetUserDisabled = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => setUserDisabled(id, disabled),
    onSuccess: () => invalidate(qc),
  });
};
