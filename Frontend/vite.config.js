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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  plugins: [
    react(),
    svgr(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^(?!\/__).*/],
        runtimeCaching: [
          {
            // Cache GET requests to the real backend API (dev + production)
            urlPattern: ({ request }) =>
              request.method === 'GET' &&
              /https?:\/\/(grupo08\.onrender\.com|127\.0\.0\.1:\d+|localhost:\d+)\/.*/i.test(
                request.url,
              ),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get-cache',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24, // 24 horas
              },
              networkTimeoutSeconds: 8,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache imagens e assets estáticos
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache fontes (Google Fonts etc)
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
              },
              cacheableResponse: {
                statuses: [0, 200],
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
