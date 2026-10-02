/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  base: '/martime/',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: { enabled: false, type: 'module' },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff}'], maximumFileSizeToCacheInBytes: 8 * 1024 * 1024 },
      manifest: {
        name: 'MarTime',
        short_name: 'MarTime',
        lang: 'pt-PT',
        start_url: '/martime/#/hoje',
        scope: '/martime/',
        display: 'standalone',
        background_color: '#FFFDF7',
        theme_color: '#3D5AFE',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // libraries in their own files: an app update only downloads what changed
        advancedChunks: {
          groups: [
            { name: 'charts', test: /node_modules[\\/](recharts|d3-|victory|decimal\.js|eventemitter3|lodash)/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|i18next|react-i18next)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/](dexie|dexie-react-hooks|@dnd-kit|lucide-react|date-fns)/ },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    env: { TZ: 'UTC' },
  },
});
