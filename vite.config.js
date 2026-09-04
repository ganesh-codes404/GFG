import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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