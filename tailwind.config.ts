import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        corgan: {
          navy: "#0F233A",
          "navy-light": "#87919D",
          "navy-dark": "#08121D",
          gold: "#B8962E",
          "gold-light": "#DCCB96",
          "gold-dark": "#5C4B17",
          forest: "#2A4A3A",
          earth: "#6B3A2A",
          copper: "#C75E29",
          teal: "#3DA2A9",
        },
      },
      fontFamily: {
        sans: ["Nunito", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
