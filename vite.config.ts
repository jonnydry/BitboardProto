import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

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
    },
  };
});
