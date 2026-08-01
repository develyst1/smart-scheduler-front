// Offline mock for the teacher LINE-link queue (SPEC-023 / TASK-076). Mirrors the API's shape exactly,
// including the server-computed `candidates` — so the collision case is exercisable without a backend.
import { teachers } from "@/lib/mock/data";
import type { TeacherLinkRequest } from "@/types/app/teacher-link";
import type { LinkRequestStatus } from "./teacher-link.service";

const delay = <T,>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 200));

const requests: TeacherLinkRequest[] = [
  {
    // The ordinary case — the bot matched exactly one teacher, so approval is one click.
    id: "lr1",
    claimedNickname: "แคท",
    teacherId: "t3",
    status: "PENDING",
    createdAt: "2026-08-01T09:12:00.000Z",
    decidedAt: null,
    decidedBy: null,
    lineUserRef: "U8f21c…",
    candidates: [{ id: "t3", nickname: "แคท", name: "ครูแคท ปิยะดา" }],
  },
  {
    // 🔴 The collision this whole feature exists for: two live teachers share "ดิว", so the bot named
    // nobody and staff must pick. Approving without choosing must be impossible.
    id: "lr2",
    claimedNickname: "ดิว",
    teacherId: null,
    status: "PENDING",
    createdAt: "2026-08-01T10:40:00.000Z",
    decidedAt: null,
    decidedBy: null,
    lineUserRef: "Ua03e7…",
    candidates: [
      { id: "t4", nickname: "ดิว", name: "ครูดิว ธนพล" },
      { id: "t7", nickname: "ดิว", name: "ครูดิว ณัฐวรรณ" },
    ],
  },
  {
    id: "lr3",
    claimedNickname: "ฟ้า",
    teacherId: "t6",
    status: "PENDING",
    createdAt: "2026-08-01T11:05:00.000Z",
    decidedAt: null,
    decidedBy: null,
    lineUserRef: "Ubb914…",
    candidates: [{ id: "t6", nickname: "ฟ้า", name: "ครูฟ้า ชนิดา" }],
  },
];

export const listTeacherLinkRequests = (status: LinkRequestStatus = "PENDING") =>
  delay(requests.filter((r) => r.status === status).map((r) => ({ ...r })));

export const approveTeacherLinkRequest = async (id: string, teacherId?: string): Promise<void> => {
  const r = requests.find((x) => x.id === id);
  if (!r) return;
  const granted = r.teacherId ?? teacherId;
  // The server refuses this; the mock refuses it too, so a UI bug can't look like it works offline.
  if (!granted) throw new Error("teacher-required");
  r.status = "APPROVED";
  r.teacherId = granted;
  r.decidedAt = new Date().toISOString();
  const t = teachers.find((x) => x.id === granted);
  if (t) t.lineLinked = true;
  await delay(null);
};

export const rejectTeacherLinkRequest = async (id: string): Promise<void> => {
  const r = requests.find((x) => x.id === id);
  if (r) {
    r.status = "REJECTED";
    r.decidedAt = new Date().toISOString();
  }
  await delay(null);
};

export const unlinkTeacherLine = async (teacherId: string): Promise<void> => {
  const t = teachers.find((x) => x.id === teacherId);
  if (t) t.lineLinked = false;
  await delay(null);
};
