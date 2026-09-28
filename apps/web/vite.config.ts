import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'AVRmusic',
        short_name: 'AVRmusic',
        description: 'Ваш музыкальный сервис: поиск, стриминг, плейлисты, тексты и канвасы',
        lang: 'ru',
        theme_color: '#0b0b10',
        background_color: '#0b0b10',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['music', 'entertainment'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Поиск', url: '/search', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Медиатека', url: '/library', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Загрузки', url: '/downloads', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//, /^\/\.well-known\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/media\/(covers|avatars)\//,
            handler: 'CacheFirst',
            options: { cacheName: 'avr-images', expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/') && !/^\/api\/(stream|download|canvas|auth)\//.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'avr-api', networkTimeoutSeconds: 6, expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/media': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
});
