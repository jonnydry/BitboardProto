# BitBoard Upgrade Guide

## New Features & Breaking Changes

This document describes major updates and how to upgrade.

## Latest Updates (v2.0)

### New Features ✨

#### 1. **Production Monitoring**
- **Sentry Integration**: Error tracking and performance monitoring
- **PostHog Analytics**: Product analytics and feature flags
- **Web Vitals Tracking**: Real-time performance metrics (LCP, FID, CLS, etc.)

**Setup Required:**
```bash
npm install @sentry/react posthog-js web-vitals
```

Add to `.env.local`:
```env
VITE_SENTRY_DSN=your_sentry_dsn
VITE_POSTHOG_API_KEY=your_posthog_key
```

#### 2. **Comprehensive Testing**
- **Playwright E2E Tests**: Full user flow testing
- **Accessibility Tests**: Automated a11y audits with axe-core
- **MSW Mocking**: Mock Nostr relays and APIs for testing
- **80% Coverage Target**: Vitest with coverage reporting

**New Scripts:**
```bash
npm run test:coverage    # Run tests with coverage
npm run test:e2e         # Run E2E tests
npm run test:e2e:ui      # E2E tests with UI
```

#### 3. **PWA Support**
- **Service Worker**: Offline caching for better performance
- **Web App Manifest**: Installable app on mobile/desktop
- **Cache Strategies**: Optimized caching for fonts and assets

**Setup Required:**
```bash
npm install vite-plugin-pwa
```

PWA enabled automatically in production builds.

#### 4. **CI/CD Enhancements**
- **Security Scanning**: npm audit in CI pipeline
- **Lighthouse CI**: Automated performance audits
- **Staging Environment**: Separate workflow for staging deploys
- **E2E in CI**: Playwright tests on every PR

**Required GitHub Secrets:**
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_DSN_STAGING`
- `VITE_POSTHOG_API_KEY`
- `VITE_POSTHOG_API_KEY_STAGING`

#### 5. **User Features**
- **Data Export**: GDPR-compliant export of all user data
- **Keyboard Shortcuts**: Power user navigation (press `?` for help)
- **Onboarding Flow**: Guided setup for new users
- **SEO Support**: Meta tags and social sharing with react-helmet-async

**New Services:**
- `dataExportService` - Export/import user data
- `keyboardShortcutsService` - Keyboard navigation
- `sentryService` - Error tracking (replaces errorTrackingService)
- `analyticsService` - Product analytics
- `webVitalsService` - Performance monitoring

#### 6. **Developer Experience**
- **Storybook**: Component development and documentation
- **Bundle Size Limits**: Automated size monitoring with size-limit
- **Strict TypeScript**: Optional strict mode configuration
- **API Documentation**: Comprehensive Nostr event schema docs

**New Scripts:**
```bash
npm run storybook         # Start Storybook
npm run size              # Check bundle size
npm run lighthouse        # Run Lighthouse audit
```

### Breaking Changes ⚠️

#### 1. **New Dependencies**
Several new dependencies were added. Run:
```bash
npm install
```

If you have a `package-lock.json`, delete it and reinstall:
```bash
rm package-lock.json
npm install
```

#### 2. **Environment Variables**
Old `.env` files need updating. Compare with new `.env.example`:
```bash
cp .env.example .env.local
# Copy your old values to .env.local
```

#### 3. **TypeScript Strict Mode**
If you want to enable strict mode:
```json
// tsconfig.json
{
  "extends": "./tsconfig.strict.json"
}
```

This will require fixing type errors. Alternatively, keep the existing `tsconfig.json`.

#### 4. **Service Worker**
PWA adds a service worker. Clear browser cache after deployment:
```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(registration => registration.unregister());
});
```

#### 5. **ErrorTrackingService Deprecated**
Replace `errorTrackingService` with `sentryService`:

**Before:**
```typescript
import { errorTrackingService } from './services/errorTracking';
errorTrackingService.captureException(error);
```

**After:**
```typescript
import { sentryService } from './services/sentryService';
sentryService.captureException(error);
```

### Migration Steps

#### For Existing Deployments

1. **Update Dependencies**
   ```bash
   git pull origin main
   npm install
   ```

2. **Update Environment Variables**
   ```bash
   # Production
   cp .env.example .env.production
   # Add your production secrets
   ```

3. **Run Tests**
   ```bash
   npm test
   npm run test:e2e
   ```

4. **Build and Test**
   ```bash
   npm run build:prod
   npm run preview:prod
   ```

5. **Deploy**
   ```bash
   # Your usual deployment command
   # e.g., vercel --prod
   ```

#### For CI/CD

1. **Add GitHub Secrets**
   - Go to Settings > Secrets and variables > Actions
   - Add all required secrets (see above)

2. **Update Workflows**
   ```bash
   git pull origin main
   # New workflows are in .github/workflows/
   ```

3. **Test Workflows**
   - Push to a test branch
   - Verify all checks pass

### New Configuration Files

These files were added:
- `.storybook/` - Storybook configuration
- `playwright.config.ts` - E2E test configuration
- `lighthouserc.json` - Lighthouse CI configuration
- `.size-limit.json` - Bundle size limits
- `tsconfig.strict.json` - Strict TypeScript config
- `.github/workflows/e2e.yml` - E2E test workflow
- `.github/workflows/lighthouse.yml` - Lighthouse workflow
- `.github/workflows/staging.yml` - Staging deployment

### Updated Documentation

New docs:
- `docs/API.md` - Nostr event schemas
- `docs/SETUP.md` - Complete setup guide
- `docs/UPGRADE.md` - This file

Updated docs:
- `README.md` - Updated with new features
- `docs/architecture.md` - New services documented
- `docs/deployment.md` - PWA and monitoring setup

### Performance Improvements

- **Bundle Splitting**: Better code splitting strategy
- **PWA Caching**: Offline-first for static assets
- **Coverage Targets**: 80% test coverage enforced
- **Lighthouse Thresholds**:
  - Performance: 80+
  - Accessibility: 90+
  - Best Practices: 90+
  - SEO: 80+

### Security Enhancements

- **CSP Headers**: Enhanced Content Security Policy
- **Permissions-Policy**: Restrict browser features
- **Security Scanning**: npm audit in CI
- **Dependency Updates**: Regular automated updates (configure Dependabot)

### Rollback Procedure

If you need to rollback:

1. **Revert to previous version**
   ```bash
   git checkout <previous-tag>
   npm install
   npm run build
   ```

2. **Disable new services**
   ```env
   # .env.local
   VITE_SENTRY_DSN=
   VITE_POSTHOG_API_KEY=
   ```

3. **Clear service worker**
   ```javascript
   // Browser console
   navigator.serviceWorker.getRegistrations().then(registrations => {
     registrations.forEach(r => r.unregister());
   });
   ```

### Support

For issues:
- Open GitHub issue
- Check `docs/SETUP.md` for troubleshooting
- Review CI logs for deployment failures

### Next Steps

1. **Enable Monitoring**
   - Set up Sentry project
   - Configure PostHog
   - Verify events are flowing

2. **Run Tests**
   - Achieve 80% coverage
   - Add E2E tests for critical flows
   - Enable Lighthouse CI

3. **Enable PWA**
   - Test installation on mobile
   - Verify offline mode works
   - Test update flow

4. **Optimize Bundle**
   - Run `npm run analyze`
   - Review bundle visualization
   - Lazy load non-critical components

5. **Document Features**
   - Add Storybook stories
   - Update user documentation
   - Create video tutorials
