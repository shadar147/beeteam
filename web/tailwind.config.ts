import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        "accent-soft": "var(--accent-soft)",
        "accent-text": "var(--accent-text)",
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
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
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
