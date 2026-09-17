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
      // All colours resolve to the CSS channel-triplet vars in globals.css — the single
      // token source (SPEC-037 / TASK-128). `rgb(var(…) / <alpha-value>)` so Tailwind
      // opacity modifiers (`bg-x/40`) compose (DEF-3 fix). No hard-coded hex scale here.
      colors: {
        foreground: "rgb(var(--color-fg) / <alpha-value>)",
        content1: "rgb(var(--color-surface) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        primary: { DEFAULT: "#228be6", foreground: "#ffffff" },
        success: "#2f9e44",
        warning: "#e8a23d",
        secondary: "#845ef7",
        danger: "#e03131",
        // 🔴 Schedule-only status colours (2026-09-16). Additive: nothing above changes, so the 16 files and
        // every `notify()` toast that read `primary/success/warning/danger/secondary` are untouched. Only the
        // two calendar grids reference `cal-*`.
        cal: {
          conf: "rgb(var(--cal-conf) / <alpha-value>)",
          att: "rgb(var(--cal-att) / <alpha-value>)",
          pend: "rgb(var(--cal-pend) / <alpha-value>)",
          // The status dot, always two ramp steps darker than the fill it sits on — see `--cal-*-dot`.
          "conf-dot": "rgb(var(--cal-conf-dot) / <alpha-value>)",
          "att-dot": "rgb(var(--cal-att-dot) / <alpha-value>)",
          "pend-dot": "rgb(var(--cal-pend-dot) / <alpha-value>)",
          "leave-dot": "rgb(var(--cal-leave-dot) / <alpha-value>)",
          "ext-dot": "rgb(var(--cal-ext-dot) / <alpha-value>)",
          "no-dot": "rgb(var(--cal-no-dot) / <alpha-value>)",
          leave: "rgb(var(--cal-leave) / <alpha-value>)",
          ext: "rgb(var(--cal-ext) / <alpha-value>)",
          no: "rgb(var(--cal-no) / <alpha-value>)",
          ink: "rgb(var(--cal-ink) / <alpha-value>)",
        },
        // `muted` replaces the old `default` scale (same slate values, now via vars).
        muted: {
          50: "rgb(var(--color-muted-50) / <alpha-value>)",
          100: "rgb(var(--color-muted-100) / <alpha-value>)",
          200: "rgb(var(--color-muted-200) / <alpha-value>)",
          300: "rgb(var(--color-muted-300) / <alpha-value>)",
          400: "rgb(var(--color-muted-400) / <alpha-value>)",
          500: "rgb(var(--color-muted-500) / <alpha-value>)",
          600: "rgb(var(--color-muted-600) / <alpha-value>)",
          700: "rgb(var(--color-muted-700) / <alpha-value>)",
          800: "rgb(var(--color-muted-800) / <alpha-value>)",
          900: "rgb(var(--color-muted-900) / <alpha-value>)",
        },
      },
    },
  },
  darkMode: "class",
  plugins: [],
};

export default config;
