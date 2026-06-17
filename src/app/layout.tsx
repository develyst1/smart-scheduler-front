import type { Metadata } from "next";
import { AppProviders } from "@/context/HeroUIProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Scheduler",
  description: "ระบบจัดตารางเรียนและบันทึกเวลาเข้าเรียน",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
