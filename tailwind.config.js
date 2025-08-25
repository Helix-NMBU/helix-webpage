/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        ibmMono: ['IBM Plex Mono', 'monospace'],
      },
      colors:{
        primary: '#03094a',
        secondary: '#09117c',
        accent: '#aaebdf',
        foreground: '#ffffff',
        default: '#000000'
      }
    },
  },
  plugins: [],
}