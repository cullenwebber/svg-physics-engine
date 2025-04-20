import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: '/index.html'
      }
    }
  },
  base: './'
});