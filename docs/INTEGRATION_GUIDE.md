# Integration Guide - Wire Up New Services

This guide shows you exactly how to integrate all the new services into your BitBoard application.

## Step 1: Update index.tsx (Main Entry Point)

Replace your current `index.tsx` with this enhanced version:

```typescript
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
      <SentryErrorBoundary fallback={<div>An error occurred</div>}>
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
  });
}
```

## Step 2: Update App.tsx (Main Component)

Add keyboard shortcuts, onboarding, and SEO to your App component:

```typescript
import { useState, useEffect } from 'react';
import { SEOHead } from './components/SEOHead';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { OnboardingFlow } from './components/OnboardingFlow';
import { keyboardShortcutsService, defaultShortcuts } from './services/keyboardShortcutsService';
import { analyticsService, AnalyticsEvents } from './services/analyticsService';
// ... your other imports

function App() {
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Initialize keyboard shortcuts
  useEffect(() => {
    keyboardShortcutsService.initialize();

    // Register default shortcuts
    defaultShortcuts.forEach((shortcut) => {
      keyboardShortcutsService.register({
        ...shortcut,
        action: () => {
          // Map shortcuts to actions based on key
          switch (shortcut.key) {
            case '?':
              if (shortcut.shift) {
                setShowKeyboardHelp(true);
              }
              break;
            case 'g':
              // Navigate to feed
              // TODO: Add your navigation logic
              break;
            case 'c':
              // Open create post
              // TODO: Add your create post logic
              break;
            // Add more shortcuts as needed
          }
        },
      });
    });

    return () => keyboardShortcutsService.destroy();
  }, []);

  // Check for first-time users
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('bitboard_onboarding_complete');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
      analyticsService.track(AnalyticsEvents.ONBOARDING_STARTED);
    }
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('bitboard_onboarding_complete', 'true');
    setShowOnboarding(false);
    analyticsService.track(AnalyticsEvents.ONBOARDING_COMPLETED);
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem('bitboard_onboarding_complete', 'true');
    setShowOnboarding(false);
    analyticsService.track(AnalyticsEvents.ONBOARDING_SKIPPED);
  };

  return (
    <>
      {/* Default SEO meta tags */}
      <SEOHead />

      {/* Keyboard shortcuts help modal */}
      <KeyboardShortcutsHelp
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />

      {/* Onboarding flow for new users */}
      <OnboardingFlow
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />

      {/* Your existing app content */}
      {/* ... */}
    </>
  );
}

export default App;
```

## Step 3: Add Data Export to Settings

In your settings/profile component, add the data export feature:

```typescript
import { dataExportService } from '../services/dataExportService';
import { analyticsService, AnalyticsEvents } from '../services/analyticsService';

// In your settings component:
<div className="border border-terminal-dim p-4">
  <h3 className="text-xl font-mono text-terminal-highlight mb-2">
    Data Management
  </h3>
  <p className="text-terminal-text font-mono text-sm mb-4">
    Export or delete your data (GDPR compliance)
  </p>

  <div className="space-y-2">
    <button
      onClick={async () => {
        await dataExportService.exportAndDownload();
        analyticsService.track('data_exported');
      }}
      className="w-full border border-terminal-highlight px-4 py-2 font-mono text-terminal-highlight hover:bg-terminal-highlight hover:text-terminal-bg"
    >
      Export My Data (JSON)
    </button>

    <button
      onClick={() => {
        if (confirm('Delete ALL your data? This cannot be undone!')) {
          dataExportService.deleteAllUserData();
          analyticsService.track('data_deleted');
          window.location.reload();
        }
      }}
      className="w-full border border-terminal-alert px-4 py-2 font-mono text-terminal-alert hover:bg-terminal-alert hover:text-terminal-bg"
    >
      Delete All My Data
    </button>
  </div>
</div>
```

## Step 4: Track Analytics Events

In your components, add analytics tracking for key events:

```typescript
import { analyticsService, AnalyticsEvents } from '../services/analyticsService';

// Example: Track post creation
const handleCreatePost = async (post) => {
  const result = await createPost(post);

  if (result.success) {
    analyticsService.track(AnalyticsEvents.POST_CREATED, {
      boardId: post.boardId,
      hasImage: !!post.imageUrl,
      hasTags: post.tags.length > 0,
      contentLength: post.content.length,
    });
  }

  return result;
};

// Example: Track voting
const handleVote = (postId, direction) => {
  vote(postId, direction);

  analyticsService.track(
    direction === 'up' ? AnalyticsEvents.VOTE_CAST : AnalyticsEvents.VOTE_CHANGED,
    {
      postId,
      direction,
    }
  );
};

// Example: Track errors
try {
  await someOperation();
} catch (error) {
  analyticsService.track(AnalyticsEvents.ERROR_OCCURRED, {
    operation: 'someOperation',
    error: error.message,
  });
  throw error;
}
```

## Step 5: Set User Context for Monitoring

When user logs in or creates identity:

```typescript
import { sentryService } from '../services/sentryService';
import { analyticsService } from '../services/analyticsService';

// When user creates/imports identity:
const handleIdentityCreated = (identity) => {
  const userId = identity.pubkey;
  const username = identity.username || 'Anonymous';

  // Set user context in Sentry
  sentryService.setUser({
    id: userId,
    username: username,
    pubkey: userId, // Custom field
  });

  // Identify user in analytics
  analyticsService.identify(userId, {
    username: username,
    createdAt: new Date().toISOString(),
  });

  // Track event
  analyticsService.track(AnalyticsEvents.USER_CREATED_IDENTITY);
};

// When user logs out:
const handleLogout = () => {
  sentryService.setUser(null);
  analyticsService.reset();
};
```

## Step 6: Add SEO to Individual Pages

For post detail pages:

```typescript
import { SEOHead, getPostSEO } from '../components/SEOHead';

function PostDetailPage({ post }) {
  return (
    <>
      <SEOHead {...getPostSEO(post)} />
      {/* Post content */}
    </>
  );
}
```

For board pages:

```typescript
import { SEOHead, getBoardSEO } from '../components/SEOHead';

function BoardPage({ board }) {
  return (
    <>
      <SEOHead {...getBoardSEO(board)} />
      {/* Board content */}
    </>
  );
}
```

## Step 7: Test the Integration

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Check browser console:**
   - Should see Sentry initialization message
   - Should see PostHog initialization message
   - Should see Web Vitals measurements

3. **Test Sentry:**
   ```javascript
   // In browser console:
   throw new Error('Test error for Sentry');
   ```
   Check Sentry dashboard for the error.

4. **Test Analytics:**
   - Click around the app
   - Check PostHog dashboard for events

5. **Test Web Vitals:**
   - Reload page
   - Check browser console for LCP, FID, CLS metrics
   - Check PostHog for `web_vital_measured` events

6. **Test Keyboard Shortcuts:**
   - Press `?` → Should show help modal
   - Press `Escape` → Should close modal

7. **Test Onboarding:**
   - Clear localStorage: `localStorage.clear()`
   - Reload page
   - Should see onboarding flow

8. **Test Data Export:**
   - Go to settings
   - Click "Export My Data"
   - Should download a JSON file

## Troubleshooting

### Sentry not tracking errors
- Check `.env.local` has `VITE_SENTRY_DSN`
- Check browser console for Sentry init message
- Verify DSN is correct in Sentry dashboard

### Analytics not tracking events
- Check `.env.local` has `VITE_POSTHOG_API_KEY`
- Check browser console for PostHog init message
- Check PostHog dashboard is accessible

### Keyboard shortcuts not working
- Check browser console for errors
- Verify `keyboardShortcutsService.initialize()` is called
- Make sure you're not typing in an input field

### Onboarding not showing
- Clear localStorage: `localStorage.removeItem('bitboard_onboarding_complete')`
- Reload page

### Type errors with HelmetProvider
```bash
npm install @types/react-helmet-async
```

## Next Steps

After integration:
1. Deploy to staging environment
2. Verify monitoring works in production
3. Add more analytics events for key actions
4. Write tests for integrated features
5. Monitor Sentry and PostHog dashboards

## Reference

- **Sentry Dashboard:** https://sentry.io
- **PostHog Dashboard:** https://app.posthog.com
- **Analytics Events:** See `services/analyticsService.ts` for full list
- **Keyboard Shortcuts:** See `services/keyboardShortcutsService.ts` for defaults
