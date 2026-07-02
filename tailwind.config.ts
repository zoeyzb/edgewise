import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        edge: {
          bg: "#0a0f14",
          surface: "#111820",
          border: "#1e2a36",
          muted: "#6b7f94",
          accent: "#22c55e",
          warn: "#f59e0b",
          danger: "#ef4444",
          info: "#38bdf8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
