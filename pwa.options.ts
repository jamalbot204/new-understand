import type { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  // Add this to make sure the service worker takes control of the page immediately.
  workbox: {
    clientsClaim: true,
    skipWaiting: true,
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    // This is crucial: it ensures that navigation requests (like loading the app)
    // are handled by the service worker, which will serve the cached index.html.
    navigateFallback: 'index.html',
  },
  manifest: {
    name: 'My Chat',
    short_name: 'My Chat',
    description: 'A personal chat application.',
    theme_color: '#000000',
    icons: [
      {
        src: 'icons/icon-192x192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: 'icons/icon-512x512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  },
};
