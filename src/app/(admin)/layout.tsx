import { AdminLayout } from "@/components/layout/AdminLayout";

export default async function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout>{children}</AdminLayout>;
}
