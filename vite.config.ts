import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One-key model: all AI keys live server-side in the Vercel env vars and are
// read only by /api/* functions. The client bundle never needs (and never
// contains) any API key, so there is nothing to inject here.

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  // Strip license banners from minified output (smaller headers, no behavior change).
  esbuild: {
    legalComments: 'none',
  },
  build: {
    // Evergreen targets reduce polyfill surface for modern browsers / Vercel.
    target: 'es2022',
    cssCodeSplit: true,
    // Inline tiny assets; keep photo JPGs (~150KB–800KB) as hashed files.
    assetsInlineLimit: 4096,
    // onnxruntime-web + wasm inflate chunk size; avoid noisy false alarms.
    chunkSizeWarningLimit: 1500,
    modulePreload: {
      polyfill: true,
    },
    rollupOptions: {
      output: {
        // Split stable libs into cacheable, parallel-loaded chunks so app-code
        // deploys do not bust React / markdown / vision vendor caches.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          markdown: ['react-markdown'],
          vision: ['onnxruntime-web'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
