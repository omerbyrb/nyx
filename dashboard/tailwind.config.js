/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        nyx: {
          bg:      "#F8F6F1",
          surface: "#FFFFFF",
          card:    "#FDFCF9",
          border:  "#E5DDD0",
          "border-strong": "#CFC5B5",
          accent:  "#1E3CB8",
          "accent-hover": "#172E96",
          "accent-light": "#3A58D4",
          "accent-pale":  "#EEF1FB",
          text:    "#0C0F1A",
          dim:     "#3D4559",
          muted:   "#8C95A8",
          green:   "#0A6B4A",
          "green-pale": "#EDFAF4",
          red:     "#B82828",
          "red-pale": "#FEF0F0",
          yellow:  "#A85F0A",
          "yellow-pale": "#FEF7EC",
        },
      },
      fontFamily: {
        sans:    ["'Onest'", "system-ui", "sans-serif"],
        display: ["'Bricolage Grotesque'", "sans-serif"],
        mono:    ["'Geist Mono'", "'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        "card":   "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 24px rgba(30,60,184,0.12), 0 1px 4px rgba(0,0,0,0.06)",
        "btn":    "0 1px 3px rgba(30,60,184,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
        "input":  "0 0 0 3px rgba(30,60,184,0.12)",
      },
    },
  },
  plugins: [],
};
