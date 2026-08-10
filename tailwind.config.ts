import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        buscoedu: {
          blue: "#123A6F",
          teal: "#18B7B2",
          yellow: "#F5B84B",
          bg: "#F7F9FC",
          text: "#1F2937",
          muted: "#6B7280",
          border: "#E5E7EB"
        }
      },
      boxShadow: {
        card: "0 8px 24px rgba(18, 58, 111, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
