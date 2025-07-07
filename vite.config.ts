import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
