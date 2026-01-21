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
        // Plugin updated to v1.2.0, but workbox-build terser issue persists
        // Service worker disabled to prevent build failures
        // TODO: Investigate workbox-build terser configuration or use injectManifest mode
        disable: true,
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
          // Fix service worker generation error by configuring workbox properly
          mode: 'production',
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

      // Provide predictable, cache-friendly chunks.
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React core
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'react';
            }
            
            // Nostr libraries
            if (id.includes('node_modules/nostr-tools/') || id.includes('node_modules/@noble/')) {
              return 'nostr';
            }
            
            // Google AI
            if (id.includes('node_modules/@google/genai')) {
              return 'genai';
            }
            
            // Markdown rendering
            if (id.includes('react-markdown') || id.includes('react-syntax-highlighter') || 
                id.includes('remark') || id.includes('rehype') || id.includes('unified') ||
                id.includes('micromark') || id.includes('mdast') || id.includes('hast')) {
              return 'markdown';
            }
            
            // Virtualization
            if (id.includes('@tanstack/react-virtual') || id.includes('@tanstack/virtual-core')) {
              return 'virtual';
            }
            
            // Icons - only frequently used ones in main bundle
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            
            // Date/time utilities
            if (id.includes('date-fns') || id.includes('luxon') || id.includes('dayjs')) {
              return 'datetime';
            }
            
            // Form/validation libraries
            if (id.includes('zod') || id.includes('yup') || id.includes('formik') || id.includes('react-hook-form')) {
              return 'forms';
            }
            
            // Crypto libraries
            if (id.includes('@scure/') || id.includes('secp256k1') || id.includes('bech32')) {
              return 'crypto';
            }
            
            // All other vendor modules in a separate chunk
            if (id.includes('node_modules')) {
              // Extract package name
              const match = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
              if (match) {
                // Package name available: match[1].replace(/[@/]/g, '_')
                // Group small packages into vendor chunk
                return 'vendor';
              }
            }
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
