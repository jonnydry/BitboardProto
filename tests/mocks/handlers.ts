/**
 * MSW (Mock Service Worker) Handlers for Testing
 *
 * Mocks Nostr relay WebSocket connections and HTTP APIs for testing.
 */

import { http, HttpResponse } from 'msw';

// Mock Gemini API responses
export const geminiHandlers = [
  http.post('https://generativelanguage.googleapis.com/v1beta/models/:model:generateContent', () => {
    return HttpResponse.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'This is a test link preview: A great article about Nostr protocol.',
              },
            ],
          },
        },
      ],
    });
  }),
];

// Mock PostHog analytics (if needed)
export const analyticsHandlers = [
  http.post('https://app.posthog.com/batch/', () => {
    return HttpResponse.json({ status: 'ok' });
  }),
  http.post('https://app.posthog.com/decide/*', () => {
    return HttpResponse.json({
      featureFlags: {},
      sessionRecording: false,
    });
  }),
];

// Mock Sentry
export const sentryHandlers = [
  http.post('https://*.sentry.io/api/:project/envelope/', () => {
    return HttpResponse.json({ id: 'test-event-id' });
  }),
];

// All handlers
export const handlers = [...geminiHandlers, ...analyticsHandlers, ...sentryHandlers];
