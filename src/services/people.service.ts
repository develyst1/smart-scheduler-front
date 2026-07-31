// People (parents + students) data access — REQ-019 / SPEC-016. The only place that talks to the
// scheduling API for the People screen. API JSON already matches the app shapes (no mapper needed).
import { api, useMockData } from "@/lib/api/client";
import type { Parent, ParentsResponse, Student } from "@/types/app/people";
import * as mock from "./people.mock.service";

export interface ParentsQuery {
  q?: string;
  limit?: number;
  offset?: number;
}

export const listParents = async (query: ParentsQuery = {}): Promise<ParentsResponse> => {
  if (useMockData) return mock.listParents(query);
  const { data } = await api.get<ParentsResponse>("/parents", { params: query });
  return data;
};

export interface ParentInput {
  phone: string;
  name?: string | null;
  province?: string | null;
}

export const createParent = async (input: ParentInput): Promise<Parent> => {
  if (useMockData) return mock.createParent(input);
  const { data } = await api.post<Parent>("/parents", input);
  return data;
};

export const updateParent = async (id: string, input: Partial<ParentInput>): Promise<Parent> => {
  if (useMockData) return mock.updateParent(id, input);
  const { data } = await api.patch<Parent>(`/parents/${id}`, input);
  return data;
};

/** Demographics settable via PATCH /students/:id (create takes only name/nickname/note). */
export interface StudentDemographics {
  gender?: string | null;
  birthDate?: string | null;
  nationality?: string | null;
}
export interface CreateStudentInput extends StudentDemographics {
  name: string;
  nickname?: string | null;
  note?: string | null;
}

/**
 * Create a student under a parent. The backend create endpoint accepts name/nickname/note only, so
 * demographics (gender/DOB/nationality) are applied with a follow-up PATCH when provided.
 */
export const createStudentForParent = async (
  parentId: string,
  input: CreateStudentInput,
): Promise<Student> => {
  if (useMockData) return mock.createStudentForParent(parentId, input);
  const { name, nickname, note, ...demo } = input;
  const { data: created } = await api.post<Student>(`/parents/${parentId}/students`, {
    name,
    nickname,
    note,
  });
  if (demo.gender != null || demo.birthDate != null || demo.nationality != null) {
    return updateStudent(created.id, demo);
  }
  return created;
};

export interface UpdateStudentInput extends StudentDemographics {
  name?: string;
  nickname?: string | null;
  note?: string | null;
}

export const updateStudent = async (id: string, input: UpdateStudentInput): Promise<Student> => {
  if (useMockData) return mock.updateStudent(id, input);
  const { data } = await api.patch<Student>(`/students/${id}`, input);
  return data;
};

export const setParentSuspended = async (id: string, suspended: boolean): Promise<Parent> => {
  if (useMockData) return mock.setParentSuspended(id, suspended);
  const { data } = await api.post<Parent>(`/parents/${id}/${suspended ? "suspend" : "unsuspend"}`, {});
  return data;
};
