import type { Config } from "tailwindcss";

// Calm, low-saturation palette (client requirement: restraint with color).
// Names mirror the old HeroUI semantic tokens so existing utility classes keep
// working after dropping the HeroUI Tailwind plugin. Mantine drives component
// colors separately (see src/lib/ui/colors.ts).
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // Mantine ships its own normalization; we disable Tailwind preflight to avoid
  // it resetting Mantine component styles (e.g. button backgrounds). A minimal
  // reset lives in globals.css instead.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-noto-sans-thai)", "system-ui", "sans-serif"],
      },
      colors: {
        foreground: "#1e293b",
        content1: "#ffffff",
        primary: { DEFAULT: "#228be6", foreground: "#ffffff" },
        success: "#2f9e44",
        warning: "#e8a23d",
        secondary: "#845ef7",
        danger: "#e03131",
        default: {
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
        },
      },
    },
  },
  darkMode: "class",
  plugins: [],
};

export default config;
