/**
 * REQ-098 / SPEC-084 (TASK-411/412) — archive a PARENT. 🔑 Every rule is the server's: the cascade (the children go
 * with the parent, their LINE link cleared), the refusal with the count (`409 PARENT_HAS_SESSIONS`), the five writes
 * refused on an archived parent (`409 PARENT_ARCHIVED` — "restore instead"), what a restore gives back (the children,
 * NOT the LINE link). This file only shapes the one query — nothing here decides who is archived (the server's two lists do).
 */
import type { ParentsQuery } from "@/services/people.service";

/**
 * The restore view's query — the SAME search as the working list, `archived: 1` on top, no paging (the archived are
 * few and the toggle shows them whole under the working page; a second pager would be a second control).
 */
export const archivedParentsQuery = (q: string | undefined): ParentsQuery => ({ ...(q ? { q } : {}), archived: 1, limit: 100 });
