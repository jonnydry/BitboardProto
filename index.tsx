import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppNew';
import { ErrorBoundary } from './components/ErrorBoundary';
import { errorTrackingService } from './services/errorTracking';
import './index.css';

// Initialize error tracking if configured (non-blocking)
const initErrorTracking = async () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn) {
    try {
      await errorTrackingService.initialize({
        enabled: true,
        dsn,
        environment: import.meta.env.MODE || 'production',
        release: import.meta.env.VITE_APP_VERSION || undefined,
      });
    } catch (error) {
      // Don't block app startup if error tracking fails
      console.warn('[App] Failed to initialize error tracking:', error);
    }
  }
};

// Initialize error tracking asynchronously (don't block rendering)
initErrorTracking();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
