/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        nyx: {
          // ── Cyberpunk UI — design system: nextlevelbuilder/ui-ux-pro-max-skill ──
          bg:      "#000000",
          surface: "#0D0D0D",
          card:    "#111111",
          border:  "#1F1F1F",
          "border-strong": "#00FF41",
          accent:  "#00FF41",     // Matrix green primary
          "accent-hover": "#00CC33",
          "accent-light": "#39FF6A",
          "accent-pale":  "#001A00",
          text:    "#E0E0E0",
          dim:     "#9A9A9A",
          muted:   "#4A4A4A",
          green:   "#00FF41",
          "green-pale": "#001A00",
          red:     "#FF3333",     // Alert red
          "red-pale": "#1A0000",
          yellow:  "#FFB800",
          "yellow-pale": "#1A1200",
        },
      },
      fontFamily: {
        sans:    ["'Fira Sans'", "system-ui", "sans-serif"],
        display: ["'Fira Code'", "monospace"],
        mono:    ["'Fira Code'", "monospace"],
      },
      boxShadow: {
        "card":       "0 0 0 1px #1F1F1F, 0 4px 16px rgba(0,0,0,0.8)",
        "card-hover": "0 0 0 1px #00FF41, 0 0 20px rgba(0,255,65,0.15)",
        "neon":       "0 0 8px rgba(0,255,65,0.6), 0 0 20px rgba(0,255,65,0.3)",
        "neon-sm":    "0 0 4px rgba(0,255,65,0.5)",
        "btn":        "0 0 12px rgba(0,255,65,0.4), inset 0 1px 0 rgba(0,255,65,0.2)",
        "input":      "0 0 0 1px #00FF41, 0 0 8px rgba(0,255,65,0.2)",
        "red":        "0 0 8px rgba(255,51,51,0.5)",
      },
      keyframes: {
        blink:   { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
        scan:    { "0%": { backgroundPosition: "0 0" }, "100%": { backgroundPosition: "0 100%" } },
        glitch:  { "0%,100%": { transform: "none" }, "20%": { transform: "skewX(-2deg)" }, "40%": { transform: "skewX(2deg)" }, "60%": { transform: "none" } },
        flicker: { "0%,100%": { opacity: "1" }, "92%": { opacity: "1" }, "93%": { opacity: "0.4" }, "94%": { opacity: "1" }, "96%": { opacity: "0.8" }, "97%": { opacity: "1" } },
        matrixIn:{ "from": { opacity: "0", transform: "translateY(-4px)" }, "to": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "blink":    "blink 1s step-end infinite",
        "glitch":   "glitch 4s ease-in-out infinite",
        "flicker":  "flicker 8s linear infinite",
        "matrix-in":"matrixIn 0.2s ease-out forwards",
      },
    },
  },
  plugins: [],
};
