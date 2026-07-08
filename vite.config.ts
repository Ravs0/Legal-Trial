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
  build: {
    rollupOptions: {
      output: {
        // Split stable vendor libs into a cacheable, parallel-loaded chunk
        // so app-code deploys don't bust the React vendor cache.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
