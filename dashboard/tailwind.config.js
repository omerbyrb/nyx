/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        nyx: {
          bg:      "#060B18",
          surface: "#0C1525",
          card:    "#0F1C30",
          border:  "#1A2E4A",
          accent:  "#2563EB",
          "accent-light": "#60A5FA",
          green:   "#10B981",
          red:     "#EF4444",
          yellow:  "#F59E0B",
          muted:   "#475569",
          text:    "#EEF2FF",
          cream:   "#F0F4FF",
          dim:     "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        display: ["'Syne'", "sans-serif"],
      },
      backgroundImage: {
        "grid-pattern": "linear-gradient(rgba(37,99,235,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid": "40px 40px",
      },
      boxShadow: {
        "glow-blue": "0 0 20px rgba(37,99,235,0.15), 0 0 60px rgba(37,99,235,0.05)",
        "glow-green": "0 0 20px rgba(16,185,129,0.15)",
        "card": "0 4px 24px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)",
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
