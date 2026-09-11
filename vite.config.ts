import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single self-contained dist/index.html: no CDN links, no runtime network
// requests, everything (JS, CSS, fonts, icons) inlined. See ASCII_BUDDY_SPEC.md §3.2.
export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
  },
});
