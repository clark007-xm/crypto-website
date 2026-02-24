import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
      animation: {
        "glow-pulse": "glow-pulse 4s ease-in-out infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("daisyui"),
  ],
  daisyui: {
    themes: [
      {
        cryptodark: {
          "primary": "#14b8a6",
          "primary-content": "#052e29",
          "secondary": "#1e293b",
          "secondary-content": "#cbd5e1",
          "accent": "#eab308",
          "accent-content": "#1a1500",
          "neutral": "#1e293b",
          "neutral-content": "#cbd5e1",
          "base-100": "#0f172a",
          "base-200": "#0c1222",
          "base-300": "#080e1a",
          "base-content": "#e2e8f0",
          "info": "#38bdf8",
          "info-content": "#001824",
          "success": "#22c55e",
          "success-content": "#001a09",
          "warning": "#f59e0b",
          "warning-content": "#1a0f00",
          "error": "#ef4444",
          "error-content": "#1a0505",
          "--rounded-box": "1rem",
          "--rounded-btn": "0.5rem",
          "--rounded-badge": "1.9rem",
          "--animation-btn": "0.25s",
          "--animation-input": "0.2s",
          "--btn-focus-scale": "0.95",
          "--tab-radius": "0.5rem",
        },
      },
    ],
    darkTheme: "cryptodark",
  },
}

export default config
