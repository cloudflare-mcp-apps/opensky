/** @type {import('tailwindcss').Config} */
export default {
  content: ["./web/**/*.{html,tsx,ts,jsx,js}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Altitude color scale
        altitude: {
          ground: "#d4353d",
          low: "#f58220",
          medium: "#fac858",
          high: "#5eaed8",
          cruise: "#1f77b4",
        },
      },
      animation: {
        "spin-slow": "spin 2s linear infinite",
      },
    },
  },
  plugins: [],
};
