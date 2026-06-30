import { AdminLayout } from "@/components/layout/AdminLayout";

// Route protection is handled server-side by src/proxy.ts (Next 16 middleware).
export default async function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout>{children}</AdminLayout>;
}
