import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { nostrService } from './services/nostrService';
import { sentryService } from './services/sentryService';
import { analyticsService } from './services/analyticsService';
import { webVitalsService } from './services/webVitalsService';
import './index.css';

// ============================================
// INITIALIZE MONITORING (BEFORE REACT)
// ============================================

// 1. Initialize Sentry (error tracking)
sentryService.initialize({
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_ENVIRONMENT || 'production',
  release: import.meta.env.VITE_APP_VERSION || '1.0.0',
  tracesSampleRate: 0.1, // 10% of transactions
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of errors
});

// 2. Initialize Analytics
analyticsService.initialize({
  enabled: !!import.meta.env.VITE_POSTHOG_API_KEY,
  apiKey: import.meta.env.VITE_POSTHOG_API_KEY,
  host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
  capturePageviews: true,
  captureClicks: false, // Manual tracking preferred
});

// 3. Initialize Web Vitals
webVitalsService.initialize({
  enabled: true, // Always collect, even in dev
  sendToAnalytics: analyticsService.isEnabled(),
  sendToSentry: sentryService.isEnabled(),
  logToConsole: import.meta.env.DEV, // Only log in dev
});

// 4. Track initial page load
webVitalsService.trackPageLoad();

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
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Wrap with Sentry ErrorBoundary if available
const SentryErrorBoundary = sentryService.isEnabled()
  ? sentryService.getErrorBoundary()
  : React.Fragment;

root.render(
  <React.StrictMode>
    <HelmetProvider>
      <SentryErrorBoundary fallback={<div className="p-4 text-terminal-alert font-mono">An error occurred. Please refresh the page.</div>}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </SentryErrorBoundary>
    </HelmetProvider>
  </React.StrictMode>
);

// ============================================
// TRACK SESSION START
// ============================================

if (analyticsService.isEnabled()) {
  analyticsService.track('session_started', {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    referrer: document.referrer,
    timestamp: new Date().toISOString(),
  });
}
