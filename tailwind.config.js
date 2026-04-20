/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px', 
      'xl': '1280px',
    },
    extend: {
      fontFamily: {
        sans: ['Lexend', 'sans-serif'],
        archivo: ['Archivo', 'sans-serif'],
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