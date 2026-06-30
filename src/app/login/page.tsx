"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Paper, PasswordInput, TextInput, Title } from "@mantine/core";
import { CalendarDays } from "lucide-react";
import { signIn } from "next-auth/react";
import { notify } from "@/lib/ui/notify";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", {
      username: username.trim(),
      password,
      redirect: false,
    });
    if (res?.error) {
      notify({
        title: "เข้าสู่ระบบไม่สำเร็จ",
        description: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
        color: "danger",
      });
      setLoading(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(next && next.startsWith("/") ? next : "/scheduler/calendar");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] p-4">
      <Paper withBorder shadow="sm" radius="lg" p="xl" className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-700 text-primary-foreground">
            <CalendarDays size={24} />
          </span>
          <Title order={3}>Smart Scheduler</Title>
          <p className="text-sm text-default-500">เข้าสู่ระบบสำหรับทีมงาน</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextInput
            label="ชื่อผู้ใช้"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            required
            autoFocus
          />
          <PasswordInput
            label="รหัสผ่าน"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />
          <Button type="submit" loading={loading} fullWidth mt="xs">
            เข้าสู่ระบบ
          </Button>
        </form>
      </Paper>
    </div>
  );
}
