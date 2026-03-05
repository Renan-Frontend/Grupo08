import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { VitePWA } from 'vite-plugin-pwa';

const normalizeBase = (value) => {
  const raw = String(value || '/').trim();
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
};

const basePath = normalizeBase(process.env.VITE_BASE_PATH || '/');

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    svgr(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/dogsapi\.origamid\.dev\/json\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 horas
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
            },
          },
        ],
      },
      manifest: {
        name: 'BP Company',
        short_name: 'BP',
        description: 'Aplicacao BP Company',
        theme_color: '#ffffff',
        start_url: basePath,
        display: 'standalone',
        background_color: '#ffffff',
        icons: [
          {
            src: `${basePath}favicon.svg`,
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: `${basePath}favicon.svg`,
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
});
