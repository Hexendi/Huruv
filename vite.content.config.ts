import { defineConfig } from 'vite';

const entry = decodeURIComponent(
  new URL('src/content/index.ts', import.meta.url).pathname,
);

/**
 * The manifest V3 content script must be a classic script, so it is built
 * separately as an IIFE. Run after the main HTML build.
 */
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome109',
    minify: 'esbuild',
    lib: {
      entry,
      name: 'HuruvContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
