import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

// Legacy software storefront is served by app/server.ts from app/dist.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
