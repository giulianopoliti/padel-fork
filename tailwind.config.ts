import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  prefix: "",
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        brand: {
          50: "#f5f7fb",
          100: "#e9eef6",
          200: "#cfd9ea",
          300: "#a9b9d7",
          400: "#7288b3",
          500: "#20335d",
          600: "#1b2b50",
          700: "#172447",
          800: "#121d39",
          900: "#0d152b",
        },
        court: {
          50: "#f8fde1",
          100: "#f1f9bf",
          200: "#e8f48f",
          300: "#dced57",
          400: "#d1e62d",
          500: "#c6de06",
          600: "#a4ba05",
          700: "#809104",
          800: "#5d6a03",
          900: "#3b4302",
        },
        blue: {
          50: "#f5f7fb",
          100: "#e9eef6",
          200: "#cfd9ea",
          300: "#a9b9d7",
          400: "#7288b3",
          500: "#2d467e",
          600: "#20335d",
          700: "#1b2b50",
          800: "#172447",
          900: "#121d39",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        "control-sm": "var(--radius-control-sm)",
        control: "var(--radius-control)",
        surface: "var(--radius-surface)",
        elevated: "var(--radius-elevated)",
        display: "var(--radius-display)",
        "display-lg": "var(--radius-display-lg)",
        pill: "var(--radius-pill)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "sponsor-marquee": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "sponsor-marquee": "sponsor-marquee 28s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
