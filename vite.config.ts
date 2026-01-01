import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';

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

      // Provide predictable, cache-friendly chunks.
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            nostr: ['nostr-tools'],
            genai: ['@google/genai'],
            markdown: ['react-markdown', 'react-syntax-highlighter'],
            virtual: ['@tanstack/react-virtual'],
            icons: ['lucide-react'],
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
      pool: 'vmThreads',
      poolOptions: {
        vmThreads: {
          singleThread: true,
        },
      },
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
