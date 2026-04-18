import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Listen on all interfaces so both http://localhost:5173 (browser) and http://127.0.0.1:5173
  // (JUCE WebView in many DAWs) reach the dev server.
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    vue(),
    // vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
