import { defineConfig } from 'vite';

const file = (name: string): string =>
  decodeURIComponent(new URL(name, import.meta.url).pathname);

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome109',
    rollupOptions: {
      input: {
        popup: file('popup.html'),
      },
    },
  },
});
