"use client";

import { MantineProvider, createTheme } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import { QueryProvider } from "@/context/query/QueryProvider";
import "dayjs/locale/th";

// Calm back-office theme: blue primary aligned with Tailwind palette,
// soft radius + restrained shadows for a modern, uncluttered feel.
const theme = createTheme({
  primaryColor: "blue",
  primaryShade: 6,
  fontFamily: "var(--font-noto-sans-thai), system-ui, sans-serif",
  headings: { fontFamily: "var(--font-noto-sans-thai), system-ui, sans-serif" },
  defaultRadius: "md",
  cursorType: "pointer",
  shadows: {
    sm: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
    md: "0 4px 12px rgba(15,23,42,0.08)",
  },
  components: {
    Card: { defaultProps: { shadow: "sm", radius: "lg", withBorder: true } },
    Paper: { defaultProps: { radius: "lg" } },
    // ข้อความวันที่ใน date picker ทุกตัวชิดขวา
    DatePickerInput: { styles: { input: { textAlign: "right" as const } } },
  },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: "th", firstDayOfWeek: 0 }}>
        <Notifications position="top-right" autoClose={4000} />
        <QueryProvider>{children}</QueryProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
