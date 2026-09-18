"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRole, deleteRole, listRoles, updateRole, type RoleInput } from "@/services/roles.service";
import { USERS_KEY } from "./useUsers";

/** REQ-092 Stage 4 (TASK-388) — the Roles page's data. A role is LIVE: every write also re-reads the users (effective sets, counts). */
export const ROLES_KEY = ["roles"] as const;

export const useRoles = (enabled = true) => useQuery({ queryKey: ROLES_KEY, queryFn: listRoles, enabled });

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ROLES_KEY });
  void qc.invalidateQueries({ queryKey: USERS_KEY });
};

export const useCreateRole = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: RoleInput) => createRole(input), onSuccess: () => invalidate(qc) });
};
export const useUpdateRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<RoleInput> }) => updateRole(id, input),
    onSuccess: () => invalidate(qc),
  });
};
export const useDeleteRole = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteRole(id), onSuccess: () => invalidate(qc) });
};
