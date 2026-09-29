/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Simple, high-contrast, non-neon colors for minimal UI
        agriGreen: '#2e7d32',
        agriLightGreen: '#4caf50',
        agriBg: '#f9f9f9',
        agriText: '#333333',
        agriBorder: '#e0e0e0'
      }
    },
  },
  plugins: [],
}
