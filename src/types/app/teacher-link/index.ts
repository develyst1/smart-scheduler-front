// Teacher LINE-link approval queue (REQ-020 Stage 2 / SPEC-023). Typing a nickname into the bot no longer
// links anything — it queues a request, and **approval is the only thing that grants a link**.

/** A live teacher sharing the claimed nickname. The API sends these so staff pick a real person, never an id. */
export interface LinkCandidate {
  id: string;
  nickname: string;
  name: string;
}

export interface TeacherLinkRequest {
  id: string;
  claimedNickname: string;
  /** null = a nickname **collision**: the bot could not tell who claimed it, so staff must choose. */
  teacherId: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** 6-char stub — the API drops the raw LINE userId; this only exists to tell two rows apart. */
  lineUserRef: string;
  /** Live teachers sharing `claimedNickname`. Length > 1 on a collision. */
  candidates: LinkCandidate[];
}

export interface TeacherLinkRequestsResponse {
  items: TeacherLinkRequest[];
}

/** A request is a collision when the bot named nobody — the case this whole feature exists for. */
export const isCollision = (r: TeacherLinkRequest) => r.teacherId === null;
