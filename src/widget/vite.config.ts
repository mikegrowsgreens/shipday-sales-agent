import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite config for building the SalesHub embeddable chat widget.
 * Produces a single IIFE bundle at public/widget/embed.js
 *
 * Build: npx vite build --config src/widget/vite.config.ts
 */
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, 'widget.tsx'),
      name: 'SalesHubWidget',
      formats: ['iife'],
      fileName: () => 'embed.js',
    },
    outDir: resolve(__dirname, '../../public/widget'),
    emptyOutDir: false,
    rollupOptions: {
      // Bundle everything — no external dependencies
      external: [],
      output: {
        // Ensure single file output
        inlineDynamicImports: true,
        // No code splitting
        manualChunks: undefined,
      },
    },
    // Inline all CSS into JS (no separate CSS file)
    cssCodeSplit: false,
    // Target modern browsers
    target: 'es2020',
    // Minify for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console.error for debugging
        drop_debugger: true,
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
