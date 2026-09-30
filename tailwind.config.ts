import type { Config } from "tailwindcss";

/**
 * Tokens de marca M1 (cónsul creativo 2026-09-29).
 * blue/teal/bg/text se mantienen como alias para no romper admin.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"]
      },
      colors: {
        buscoedu: {
          ink: "#0B3A4A",
          action: "#0E7490",
          actionHover: "#155E75",
          growth: "#0F766E",
          paper: "#F4F7F6",
          sage: "#D7EDEA",
          warn: "#B45309",
          blue: "#0B3A4A",
          teal: "#0E7490",
          yellow: "#B45309",
          bg: "#F4F7F6",
          text: "#0B3A4A",
          muted: "#5B6B73",
          border: "#D5DEDC",
          chat: "#B7C6DA",
          "chat-edge": "#6E86A6"
        }
      },
      boxShadow: {
        card: "0 8px 24px rgba(11, 58, 74, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
