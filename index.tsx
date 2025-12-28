import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { nostrService } from './services/nostrService';
import './index.css';

// PERFORMANCE: Pre-warm relay connections BEFORE React renders
// This shaves ~500-1000ms off initial load by overlapping network with hydration
// Fire-and-forget: don't await, let it run in parallel with React rendering
nostrService.preconnect().catch(() => {
  // Silently ignore preconnect failures - app will retry on first use
});

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
