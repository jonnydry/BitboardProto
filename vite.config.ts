import path from 'path';
import { defineConfig, type UserConfig as _UserConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';

// @ts-expect-error - vitest/vite type version mismatch
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const analyze = process.env.ANALYZE === 'true';

  return {
    // Allows hosting under a sub-path (ex: GitHub Pages) via env var.
    // Keep default "/" for typical deployments (Vercel/Netlify/CF Pages).
    base: process.env.VITE_BASE_PATH || '/',

    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    preview: {
      port: 4173,
      host: '0.0.0.0',
    },

    plugins: [
      react(),
      VitePWA({
        disable: false,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
        manifest: {
          name: 'BitBoard - Decentralized Message Board',
          short_name: 'BitBoard',
          description: 'A terminal-styled message board built on the Nostr protocol',
          theme_color: '#00ff00',
          background_color: '#0a0a0a',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // Use development so workbox-build skips @rollup/plugin-terser on the SW bundle.
          // Vite 6 + multi-chunk SW + terser can hit "Unexpected early exit" during renderChunk.
          mode: 'development',
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          // Disable terser minification to prevent "Unexpected early exit" error
          // The service worker will still be optimized by Vite's build process
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false, // Disable in dev for better DX
        },
      }),
      analyze
        ? visualizer({
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
            open: true,
          })
        : undefined,
    ].filter(Boolean),

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    build: {
      // Keep sourcemaps out of production artifacts by default.
      sourcemap: !isProd,

      // Chunk size warning threshold (in KB)
      chunkSizeWarningLimit: 600,

      // Provide cache-friendly chunks. Keep scheduler with React, and do not
      // force a catch-all vendor file: those two choices produced circular
      // bundles that crashed before first paint (Lighthouse NO_FCP).
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'react';
            }

            if (id.includes('node_modules/nostr-tools/') || id.includes('node_modules/@noble/')) {
              return 'nostr';
            }

            if (
              id.includes('react-markdown') ||
              id.includes('react-syntax-highlighter') ||
              id.includes('remark') ||
              id.includes('rehype') ||
              id.includes('unified') ||
              id.includes('micromark') ||
              id.includes('mdast') ||
              id.includes('hast')
            ) {
              return 'markdown';
            }

            if (id.includes('@tanstack/react-virtual') || id.includes('@tanstack/virtual-core')) {
              return 'virtual';
            }

            if (id.includes('lucide-react')) {
              return 'icons';
            }

            if (
              id.includes('node_modules/@sentry/') ||
              id.includes('node_modules/posthog-js/') ||
              id.includes('node_modules/web-vitals/')
            ) {
              return 'monitoring';
            }

            if (id.includes('node_modules/zustand/')) {
              return 'state';
            }

            if (id.includes('node_modules/react-helmet-async/')) {
              return 'app-shell';
            }

            if (id.includes('node_modules/ngeohash/')) {
              return 'location';
            }

            if (id.includes('@scure/') || id.includes('secp256k1') || id.includes('bech32')) {
              return 'crypto';
            }

            return undefined;
          },
        },
      },
    },

    // Web Worker configuration
    worker: {
      format: 'es',
    },

    // Minor hardening: keep stack traces but drop debugger statements in prod.
    esbuild: {
      drop: isProd ? ['debugger'] : [],
    },

    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME_ISO__: JSON.stringify(new Date().toISOString()),
    },

    test: {
      environment: 'jsdom',
      include: ['**/*.test.ts', '**/*.test.tsx'],
      globals: true,
      passWithNoTests: false,
      setupFiles: ['./tests/setup.ts'],
      pool: 'threads',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
        exclude: [
          'node_modules/',
          'tests/',
          '*.config.ts',
          '*.config.js',
          'dist/',
          '.storybook/',
          '**/*.stories.tsx',
          '**/*.test.ts',
          '**/*.test.tsx',
        ],
        all: true,
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  };
});
