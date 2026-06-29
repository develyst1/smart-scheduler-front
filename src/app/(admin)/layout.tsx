import { AdminLayout } from "@/components/layout/AdminLayout";
import AuthGuard from "@/components/auth/AuthGuard";

export default async function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AdminLayout>{children}</AdminLayout>
    </AuthGuard>
  );
}
