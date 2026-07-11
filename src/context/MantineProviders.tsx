"use client";

import { MantineProvider, createTheme } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import { SessionProvider } from "next-auth/react";
import { QueryProvider } from "@/context/query/QueryProvider";
import { I18nProvider, useI18n } from "@/lib/i18n";
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

// Date-picker locale follows the active language (en default, th when switched).
function LocalizedDates({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  return (
    <DatesProvider settings={{ locale: lang, firstDayOfWeek: 0 }}>{children}</DatesProvider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <I18nProvider>
        <MantineProvider theme={theme} defaultColorScheme="light">
          <LocalizedDates>
            <Notifications position="top-right" autoClose={4000} />
            <QueryProvider>{children}</QueryProvider>
          </LocalizedDates>
        </MantineProvider>
      </I18nProvider>
    </SessionProvider>
  );
}
