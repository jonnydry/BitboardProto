import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { nostrService } from './services/nostr/NostrService';
import { sentryService } from './services/sentryService';
import { analyticsService } from './services/analyticsService';
import './index.css';

async function initializeMonitoring() {
  const [{ webVitalsService }] = await Promise.all([import('./services/webVitalsService')]);

  await sentryService.initialize({
    enabled: !!import.meta.env.VITE_SENTRY_DSN,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_ENVIRONMENT || 'production',
    release: import.meta.env.VITE_APP_VERSION || '1.0.0',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  analyticsService.initialize({
    enabled: !!import.meta.env.VITE_POSTHOG_API_KEY,
    apiKey: import.meta.env.VITE_POSTHOG_API_KEY,
    host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
    capturePageviews: true,
    captureClicks: false,
  });

  webVitalsService.initialize({
    enabled: true,
    sendToAnalytics: analyticsService.isEnabled(),
    sendToSentry: sentryService.isEnabled(),
    logToConsole: import.meta.env.DEV,
  });

  webVitalsService.trackPageLoad();

  if (analyticsService.isEnabled()) {
    analyticsService.track('session_started', {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
    });
  }
}

function scheduleMonitoringInitialization() {
  const start = () => {
    void initializeMonitoring();
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => start(), { timeout: 2000 });
    return;
  }

  globalThis.setTimeout(start, 0);
}

// ============================================
// PRE-WARM RELAY CONNECTIONS
// ============================================

// PERFORMANCE: Pre-warm relay connections BEFORE React renders
// This shaves ~500-1000ms off initial load by overlapping network with hydration
// Fire-and-forget: don't await, let it run in parallel with React rendering
nostrService.preconnect().catch(() => {
  // Silently ignore preconnect failures - app will retry on first use
});

// ============================================
// RENDER REACT APP
// ============================================

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);

sentryService.configure({
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_ENVIRONMENT || 'production',
  release: import.meta.env.VITE_APP_VERSION || '1.0.0',
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

analyticsService.configure({
  enabled: !!import.meta.env.VITE_POSTHOG_API_KEY,
  apiKey: import.meta.env.VITE_POSTHOG_API_KEY,
  host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
  capturePageviews: true,
  captureClicks: false,
});

root.render(
  <React.StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HelmetProvider>
  </React.StrictMode>,
);

scheduleMonitoringInitialization();
