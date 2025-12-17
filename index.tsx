import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppNew';
import { ErrorBoundary } from './components/ErrorBoundary';
import { errorTrackingService } from './services/errorTracking';
import './index.css';

// Initialize error tracking if configured
const initErrorTracking = async () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn) {
    await errorTrackingService.initialize({
      enabled: true,
      dsn,
      environment: import.meta.env.MODE || 'production',
      release: import.meta.env.VITE_APP_VERSION || undefined,
    });
  }
};

// Initialize error tracking before rendering
initErrorTracking().catch(console.error);

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
