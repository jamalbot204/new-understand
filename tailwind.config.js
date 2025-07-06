/** @type {import('tailwindcss').Config} */
export default {
 content: [
  "./index.html",
  "./{components,contexts,hooks,services}/**/*.{ts,tsx}",
  "./App.tsx",
  "./index.tsx"
],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
    require('@tailwindcss/container-queries'),
  ],
}
