import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two entry pages now (the float64 explorer and the decimal deep-zoom
// variant) — `vite dev` serves any root HTML file by path without config,
// but `vite build` only bundles index.html unless every entry is listed here.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        deepZoom: resolve(__dirname, 'deep-zoom.html'),
      },
    },
  },
});
