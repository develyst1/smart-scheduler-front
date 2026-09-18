import RolesContent from "@/components/partials/Roles/RolesContent";

// REQ-092 Stage 4 (TASK-388) — the super admin's Roles page (builder + matrix). The server guards it
// (`requireSuperAdmin`); the page and the nav entry hide themselves on `session.user.isSuperAdmin` as the honest UI.
export default async function RolesPage() {
  return <RolesContent />;
}
