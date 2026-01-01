# BitBoard Setup Guide

Complete setup instructions for developers and deployers.

## Prerequisites

- **Node.js**: Version 20 or higher
- **npm**: Version 9 or higher
- **Git**: For version control

## Local Development Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/bitboard.git
cd bitboard

# Install dependencies
npm install
```

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env.local

# Edit .env.local with your configuration
# See .env.example for all available options
```

### 3. Start Development Server

```bash
# Start dev server (http://localhost:3000)
npm run dev
```

The app will hot-reload as you make changes.

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

Target coverage: 80%+ across the board.

### E2E Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests (headless)
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run E2E tests (headed mode for debugging)
npm run test:e2e:headed
```

### Accessibility Tests

E2E tests include automated accessibility checks with axe-core. Run:

```bash
npm run test:e2e -- tests/e2e/accessibility.spec.ts
```

## Production Build

```bash
# Build for production
npm run build:prod

# Preview production build locally
npm run preview:prod
```

The build output will be in `dist/`.

## Performance Monitoring

### Bundle Size Analysis

```bash
# Analyze bundle size
npm run analyze

# Check bundle size limits
npm run size
```

### Lighthouse CI

```bash
# Run Lighthouse CI audit
npm run lighthouse
```

This runs performance, accessibility, SEO, and best practices audits.

## Development Tools

### Storybook

```bash
# Start Storybook dev server
npm run storybook

# Build Storybook for deployment
npm run build-storybook
```

### Code Quality

```bash
# Run ESLint
npm run lint

# Format code with Prettier
npm run format
```

## Environment-Specific Setup

### Development

```env
VITE_ENVIRONMENT=development
VITE_DEBUG_LOGGING=true
# Sentry and analytics disabled in dev by default
```

### Staging

```env
VITE_ENVIRONMENT=staging
VITE_SENTRY_DSN=your_staging_dsn
VITE_POSTHOG_API_KEY=your_staging_key
```

### Production

```env
VITE_ENVIRONMENT=production
VITE_SENTRY_DSN=your_production_dsn
VITE_POSTHOG_API_KEY=your_production_key
VITE_GEMINI_API_KEY=your_api_key
```

## Monitoring Setup

### Sentry (Error Tracking)

1. Create account at https://sentry.io
2. Create new project (React)
3. Copy DSN to `VITE_SENTRY_DSN`
4. Deploy and verify events appear

### PostHog (Analytics)

1. Create account at https://posthog.com
2. Create new project
3. Copy API key to `VITE_POSTHOG_API_KEY`
4. (Optional) Set custom host: `VITE_POSTHOG_HOST`

### Web Vitals

Web Vitals are automatically tracked and sent to:
- Console (development)
- PostHog (if enabled)
- Sentry (poor metrics only)

## Optional Features

### Gemini Link Scanning

For AI-powered link previews:

1. Get API key from https://ai.google.dev
2. Set `VITE_GEMINI_API_KEY`
3. Enable in settings or config.ts

### PWA (Progressive Web App)

PWA is enabled by default in production builds:
- Service worker for offline caching
- Web app manifest for installation
- Cache-first strategy for fonts and static assets

Test PWA locally:
```bash
npm run build:prod
npm run preview:prod
# Open Chrome DevTools > Application > Service Workers
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for platform-specific deployment guides:
- Vercel (recommended)
- Netlify
- Cloudflare Pages
- Docker
- Static hosting

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
VITE_PORT=3001 npm run dev
```

### Cache Issues

```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Clear all caches
rm -rf node_modules/.vite dist .cache
```

### TypeScript Errors

```bash
# Regenerate TypeScript cache
rm -rf node_modules/.cache
npm run build
```

### Test Failures

```bash
# Clear test cache
npm run test -- --clearCache

# Update snapshots (if using)
npm run test -- -u
```

## CI/CD Setup

GitHub Actions workflows are included:

- **deploy.yml**: Main build and deployment
- **staging.yml**: Deploy to staging on develop branch
- **e2e.yml**: E2E tests on PR
- **lighthouse.yml**: Performance audits
- **test-only.yml**: Quick test runs

Required secrets:
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_DSN_STAGING`
- `VITE_POSTHOG_API_KEY`
- `VITE_POSTHOG_API_KEY_STAGING`
- `VITE_GEMINI_API_KEY`

## Development Workflow

1. **Create feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes with tests**
   - Write tests first (TDD)
   - Ensure coverage stays above 80%
   - Run `npm run lint` before committing

3. **Commit with conventional commits**
   ```bash
   git commit -m "feat: add keyboard shortcuts"
   ```

4. **Push and create PR**
   ```bash
   git push origin feature/my-feature
   ```

5. **Wait for CI checks**
   - All tests must pass
   - Lighthouse scores must meet thresholds
   - No security vulnerabilities (npm audit)

## Next Steps

- Read [ARCHITECTURE.md](./architecture.md) to understand the codebase
- Review [API.md](./API.md) for Nostr event schemas
- Check [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines
