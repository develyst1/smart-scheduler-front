// In-memory People mock — used when NEXT_PUBLIC_USE_MOCK=true, so the /scheduler/people screen is
// exercisable offline (list/search/create/edit/suspend) without a backend. Mirrors the real contract.
import type { Parent, ParentsResponse, Student } from "@/types/app/people";
import type { CreateStudentInput, ParentInput, ParentsQuery, UpdateStudentInput } from "./people.service";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const delay = <T>(v: T, ms = 200) => new Promise<T>((r) => setTimeout(() => r(v), ms));

let seq = 100;
const nextId = () => `mock-${++seq}`;

const parents: Parent[] = [
  {
    id: "p1",
    phone: "0811111111",
    name: "สมชาย ใจดี",
    province: "กรุงเทพมหานคร",
    note: "แพ้ถั่ว — แจ้งครูทุกครั้ง",
    suspendedAt: null,
    students: [
      { id: "s1", parentId: "p1", name: "เด็กชายพีรพัฒน์ ใจดี", nickname: "พีพี", gender: "male", birthDate: "2015-04-12", nationality: "ไทย", note: null },
      { id: "s2", parentId: "p1", name: "เด็กหญิงมีนา ใจดี", nickname: "มีมี่", gender: "female", birthDate: "2017-08-01", nationality: "ไทย", note: null },
    ],
  },
  {
    id: "p2",
    phone: "0822222222",
    name: "Jane Smith",
    province: "ภูเก็ต",
    note: null,
    suspendedAt: null,
    students: [
      { id: "s3", parentId: "p2", name: "Leo Smith", nickname: "Leo", gender: "male", birthDate: "2016-02-20", nationality: "USA", note: null },
    ],
  },
  {
    id: "p3",
    phone: "0833333333",
    name: "สุดา รักเรียน",
    province: null,
    note: null,
    suspendedAt: "2026-07-30T09:00:00.000Z",
    students: [],
  },
];

export const listParents = (query: ParentsQuery = {}): Promise<ParentsResponse> => {
  const q = query.q?.trim().toLowerCase();
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  const filtered = q
    ? parents.filter(
        (p) =>
          (p.name ?? "").toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.students.some(
            (s) => s.name.toLowerCase().includes(q) || (s.nickname ?? "").toLowerCase().includes(q),
          ),
      )
    : parents;
  return delay({ parents: clone(filtered.slice(offset, offset + limit)), total: filtered.length });
};

export const createParent = (input: ParentInput): Promise<Parent> => {
  const p: Parent = {
    id: nextId(),
    phone: input.phone,
    name: input.name ?? null,
    province: input.province ?? null,
    note: input.note ?? null,
    suspendedAt: null,
    students: [],
  };
  parents.unshift(p);
  return delay(clone(p));
};

export const updateParent = (id: string, input: Partial<ParentInput>): Promise<Parent> => {
  const p = parents.find((x) => x.id === id)!;
  if (input.name !== undefined) p.name = input.name ?? null;
  if (input.phone !== undefined) p.phone = input.phone;
  if (input.province !== undefined) p.province = input.province ?? null;
  if (input.note !== undefined) p.note = input.note ?? null;
  return delay(clone(p));
};

export const createStudentForParent = (parentId: string, input: CreateStudentInput): Promise<Student> => {
  const p = parents.find((x) => x.id === parentId)!;
  const s: Student = {
    id: nextId(),
    parentId,
    name: input.name,
    nickname: input.nickname ?? null,
    gender: input.gender ?? null,
    birthDate: input.birthDate ?? null,
    nationality: input.nationality ?? null,
    note: input.note ?? null,
  };
  p.students.push(s);
  return delay(clone(s));
};

export const updateStudent = (id: string, input: UpdateStudentInput): Promise<Student> => {
  const p = parents.find((x) => x.students.some((s) => s.id === id))!;
  const s = p.students.find((x) => x.id === id)!;
  const rec = s as unknown as Record<string, unknown>;
  for (const k of ["name", "nickname", "gender", "birthDate", "nationality", "note"] as const) {
    if (input[k] !== undefined) rec[k] = input[k] ?? null;
  }
  return delay(clone(s));
};

export const setParentSuspended = (id: string, suspended: boolean): Promise<Parent> => {
  const p = parents.find((x) => x.id === id)!;
  p.suspendedAt = suspended ? new Date("2026-08-01T00:00:00.000Z").toISOString() : null;
  return delay(clone(p));
};
