import type { Config } from "tailwindcss";

/**
 * Colores de marca apuntan a los tokens A2 (app/globals.css).
 * El formato rgb/alpha mantiene utilidades como bg-buscoedu-teal/10.
 * teal y action son el índigo: los botones que ya decían text-white siguen en AA.
 * El coral no está en esta escala, para que ninguna pantalla vieja lo use con texto blanco.
 */
const canal = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Impact", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      colors: {
        buscoedu: {
          ink: canal("--color-text-rgb"),
          action: canal("--color-primary-rgb"),
          actionHover: "#2a2166",
          growth: canal("--color-success-rgb"),
          paper: canal("--color-bg-rgb"),
          sage: canal("--color-band-rgb"),
          warn: canal("--color-error-rgb"),
          blue: canal("--color-text-rgb"),
          teal: canal("--color-primary-rgb"),
          yellow: canal("--color-error-rgb"),
          bg: canal("--color-bg-rgb"),
          text: canal("--color-text-rgb"),
          muted: canal("--color-muted-rgb"),
          border: canal("--color-line-rgb"),
          chat: "#b7c6da",
          "chat-edge": "#6e86a6"
        }
      },
      boxShadow: {
        card: "0 8px 24px rgba(26, 24, 48, 0.08)",
        hard: "4px 4px 0 #1a1830"
      },
      borderRadius: {
        card: "16px"
      }
    }
  },
  plugins: []
};

export default config;
