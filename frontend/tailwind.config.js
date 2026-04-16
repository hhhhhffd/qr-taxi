/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aparu: {
          brand:    '#FF6A00',
          bgGray:   '#F5F5F7',
          textMain: '#333333',
          textMuted:'#999999',
          border:   '#EAEAEA',
        }
      },
      boxShadow: {
        card: '0 2px 10px rgba(0,0,0,0.08)',
      }
    }
  },
  plugins: [],
}
