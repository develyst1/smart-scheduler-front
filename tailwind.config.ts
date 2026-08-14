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
      // All colours resolve to the CSS variables defined once in globals.css — the
      // single token source (SPEC-037 / TASK-128). No hard-coded hex scale here.
      colors: {
        foreground: "var(--color-fg)",
        content1: "var(--color-surface)",
        paper: "var(--color-paper)",
        primary: { DEFAULT: "#228be6", foreground: "#ffffff" },
        success: "#2f9e44",
        warning: "#e8a23d",
        secondary: "#845ef7",
        danger: "#e03131",
        // `muted` replaces the old `default` scale (same slate values, now via vars).
        muted: {
          50: "var(--color-muted-50)",
          100: "var(--color-muted-100)",
          200: "var(--color-muted-200)",
          300: "var(--color-muted-300)",
          400: "var(--color-muted-400)",
          500: "var(--color-muted-500)",
          600: "var(--color-muted-600)",
          700: "var(--color-muted-700)",
          800: "var(--color-muted-800)",
          900: "var(--color-muted-900)",
        },
      },
    },
  },
  darkMode: "class",
  plugins: [],
};

export default config;
