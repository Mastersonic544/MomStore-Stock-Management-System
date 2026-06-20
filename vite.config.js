import { defineConfig } from 'vite'

// Vanilla JS app. Vercel auto-detects Vite: build = `vite build`, output = `dist`.
export default defineConfig({
  build: { outDir: 'dist' },
})
