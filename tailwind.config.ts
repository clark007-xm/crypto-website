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
        "onetap-light": {
          primary: "#3155eb", "primary-content": "#ffffff",
          secondary: "#e7ebfc", "secondary-content": "#1e36a5",
          accent: "#3155eb", "accent-content": "#ffffff",
          neutral: "#172039", "neutral-content": "#ffffff",
          "base-100": "#f6f5ef", "base-200": "#eeeee9", "base-300": "#e3e5e9",
          "base-content": "#111727", info: "#245bbb", "info-content": "#ffffff",
          success: "#197755", "success-content": "#ffffff",
          warning: "#916019", "warning-content": "#ffffff",
          error: "#bf3444", "error-content": "#ffffff",
          "--rounded-box": "1rem", "--rounded-btn": "0.75rem", "--rounded-badge": "1rem",
        },
        "onetap-dark": {
          primary: "#ff826c", "primary-content": "#26110e",
          secondary: "#292e48", "secondary-content": "#e7e5f5",
          accent: "#ff826c", "accent-content": "#26110e",
          neutral: "#242940", "neutral-content": "#f4f0ff",
          "base-100": "#141728", "base-200": "#20253b", "base-300": "#101322",
          "base-content": "#f3eff9", info: "#a9c7ff", "info-content": "#152337",
          success: "#8fd9b6", "success-content": "#102e23",
          warning: "#f5c88a", "warning-content": "#34240f",
          error: "#ff93a1", "error-content": "#3b1118",
          "--rounded-box": "1.25rem", "--rounded-btn": "1rem", "--rounded-badge": "1rem",
        },
      },
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
