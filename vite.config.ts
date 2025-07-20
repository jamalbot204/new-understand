import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.options';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-syntax-highlighter': ['react-syntax-highlighter'],
          'framer-motion': ['framer-motion'],
          'react-markdown': ['react-markdown'],
        },
      },
    },
  },
});
