"use client";

import { useQuery } from "@tanstack/react-query";
import { api, useMockData } from "@/lib/api/client";
import { MOCK_SUBJECTS } from "@/lib/mock/data";

/**
 * 🔴 **TASK-806 (REQ-121) — every ACTIVE program, not just the ones some teacher already has.**
 *
 * The teacher form's Subjects picker used to offer the UNION of `subjectOptions` across the roster, so a program on no teacher (both DUO
 * programs on uat) could never be offered, never be assigned, and the course form's DUO Program stayed disabled. `GET /subjects` (TASK-805) lists
 * every active program by name, each with its `kind`. 🚫 Read here and nowhere else — the course / DUO pickers keep their own source (§13.4a: they
 * still hide DUO).
 */
export interface ProgramOption {
  id: string;
  name: string;
  kind: "PRIVATE" | "DUO";
}
export interface SubjectsResponse {
  subjects: ProgramOption[];
}

export const SUBJECTS_KEY = ["subjects"] as const;

export const getSubjects = async (): Promise<SubjectsResponse> => {
  if (useMockData) return { subjects: MOCK_SUBJECTS };
  const { data } = await api.get<SubjectsResponse>("/subjects");
  return data;
};

/** The catalog changes rarely (an admin adds a program) — cache it for the session. */
export const useSubjects = () => useQuery({ queryKey: SUBJECTS_KEY, queryFn: getSubjects, staleTime: 5 * 60_000 });
