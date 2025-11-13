/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lexend', 'sans-serif'],
      },
      colors: {
        primary: '#03094a',
        secondary: '#09117c',
        accent: '#aaebdf',
        foreground: '#ffffff',
        default: '#000000'
      }
    },
  },
  plugins: [
    require('tailwindcss-animate')
  ],
}