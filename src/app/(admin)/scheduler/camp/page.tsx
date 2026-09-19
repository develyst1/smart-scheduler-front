import CampContent from "@/components/partials/Camp/CampContent";

// REQ-095 Stage 3a (TASK-402) — the Camp menu. Behind `menu:camp` (the route guard on the admin layout); the server
// guards the routes.
export default async function CampPage() {
  return <CampContent />;
}
