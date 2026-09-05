import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages serves a project site under /<repo-name>/, so asset URLs
  // need that prefix baked in -- but only for that build; local dev and a
  // plain `npm run build` for LAN hosting still want "/". The deploy
  // workflow sets GITHUB_PAGES=true.
  base: process.env.GITHUB_PAGES ? '/GFG/' : '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Expose on the LAN by default so a friend can open your IP address
    // and reach the same dev server, instead of only localhost.
    host: true,
  },
})