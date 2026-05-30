import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── BeeTeam design tokens ──────────────────────────────────────────
        // Brand palette (README's "--accent" family); named `brand` because shadcn reserves `accent`.
        brand: "var(--brand)",
        "brand-strong": "var(--brand-strong)",
        "brand-soft": "var(--brand-soft)",
        "brand-text": "var(--brand-text)",
        bg: "var(--bg)",
        "bg-elev": "var(--bg-elev)",
        "bg-tint": "var(--bg-tint)",
        "bg-sunken": "var(--bg-sunken)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        "ink-4": "var(--ink-4)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        "line-strong": "var(--line-strong)",
        ok: "var(--ok)", "ok-soft": "var(--ok-soft)",
        warn: "var(--warn)", "warn-soft": "var(--warn-soft)",
        miss: "var(--miss)", "miss-soft": "var(--miss-soft)",
        info: "var(--info)", "info-soft": "var(--info-soft)",
        // ── shadcn/ui CSS-variable-backed tokens ───────────────────────────
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        "accent-shadcn": {
          DEFAULT: "var(--accent-shadcn)",
          foreground: "var(--accent-shadcn-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      borderRadius: {
        // ── BeeTeam design tokens ──────────────────────────────────────────
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        // ── shadcn/ui radius token (note: shadcn uses --radius for md/default;
        //    our --radius is the same var so DEFAULT above serves both) ─────
        md: "calc(var(--radius) - 2px)",
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        pop: "var(--shadow-pop)",
      },
    },
  },
  plugins: [],
};
export default config;
