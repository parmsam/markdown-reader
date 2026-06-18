/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Light mode: warm parchment
        sand: {
          50:  "#fafaf7",
          100: "#f5f3ee",
          200: "#eae7df",
          300: "#d6d1c6",
          400: "#b8b2a3",
          500: "#9a9285",
          600: "#756d61",
          700: "#56504a",
          800: "#38342f",
          900: "#211e1b",
          950: "#131210",
        },
        // Amber accent used for highlights and controls
        amber: {
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
      },
      fontFamily: {
        prose: ["Georgia", "Cambria", "Times New Roman", "serif"],
        ui: ["-apple-system", "BlinkMacSystemFont", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "player": "0 -1px 0 0 var(--border), 0 -8px 32px -4px rgba(0,0,0,0.12)",
        "player-dark": "0 -1px 0 0 rgba(255,255,255,0.06), 0 -8px 32px -4px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};
