import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Answer Script Annotation',
        short_name: 'Annotation',
        description: 'Capture and annotate student answer scripts',
        theme_color: '#2196F3',
        background_color: '#f5f6f8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/raw/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      // /login must only proxy POST (GET /login is the frontend login page)
      '/login': {
        target: 'http://localhost:8000',
        bypass: (req) => req.method !== 'POST' ? req.url : null,
      },
      '/users': 'http://localhost:8000',
      '/detect-corners': 'http://localhost:8000',
      '/upload': 'http://localhost:8000',
      '/documents': 'http://localhost:8000',
      '/my-uploads': 'http://localhost:8000',
      '/my-pages': 'http://localhost:8000',
      // use ^ so only sub-paths are proxied, not the bare /admin or /manager routes
      '^/admin/': 'http://localhost:8000',
      '^/manager/': 'http://localhost:8000',
      '/annotation-requests': 'http://localhost:8000',
      '/masking-requests': 'http://localhost:8000',
      '/my-masking-pages': 'http://localhost:8000',
      '^/manager/masking-pages': 'http://localhost:8000',
      '/pages': 'http://localhost:8000',
      '/export': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
      '/raw': 'http://localhost:8000',
      '/masked': 'http://localhost:8000',
      '/folders': 'http://localhost:8000',
    },
  },
});
