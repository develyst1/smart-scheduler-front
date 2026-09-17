import UsersContent from "@/components/partials/Users/UsersContent";

// REQ-092 Stage 1 (TASK-378) — the super admin's Users page. The server guards it (`requireSuperAdmin`); the page
// and the nav entry hide themselves on `session.user.isSuperAdmin` as the honest UI.
export default async function UsersPage() {
  return <UsersContent />;
}
