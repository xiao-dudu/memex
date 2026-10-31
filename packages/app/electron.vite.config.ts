import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@memex/shared'] })],
    define: {
      __MEMEX_SUPABASE_URL__: JSON.stringify(process.env.MEMEX_SUPABASE_URL ?? ''),
      __MEMEX_SUPABASE_ANON_KEY__: JSON.stringify(process.env.MEMEX_SUPABASE_ANON_KEY ?? ''),
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@memex/shared'] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          quickCapture: resolve(__dirname, 'src/renderer/quick-capture.html'),
          timerWidget: resolve(__dirname, 'src/renderer/timer-widget.html'),
        },
      },
    },
  },
});
