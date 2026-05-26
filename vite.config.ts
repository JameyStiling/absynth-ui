import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const embedForPlugin = mode === 'plugin'

  return {
    // Relative asset paths so the production bundle works from the VST3 Resources folder.
    base: './',
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
      ...(embedForPlugin ? [viteSingleFile()] : []),
    ],
    build: embedForPlugin
      ? {
          // One self-contained index.html for WKWebView resource provider (no ES module fetches).
          cssCodeSplit: false,
          assetsInlineLimit: 100000000,
        }
      : undefined,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
