## BitBoard

BitBoard is a terminal-styled message board built on the **Nostr** protocol. Create topic boards, location-based channels, and encrypted discussions in a retro terminal aesthetic.

### Features

- **Posts + boards**: topic boards and geohash-based location channels (BitChat heritage)
- **Comments**: threaded discussions with edit/delete support (companion events)
- **Unique Voting (the niche)**: Hybrid "bits" economy (daily local quota for deliberate signal) + cryptographically verified Nostr kind-7 reactions (1 vote per pubkey per item, uniqueVoters tallies, optimistic + rollbacks). Skin in the game without tokens.
- **Encryption**: AES-256-GCM encrypted boards for private discussions (keys only via shareable URL fragments + localStorage)
- **Location / GEO**: Generated precision geohash boards + nearby activity discovery (geonet). "Local channels" today on Nostr; natural bridge to mesh.
- **Offline-friendly**: local caching, persisted message queue, post outbox, PWA service worker
- **Nostr-native + extras**: Broad NIP support (zaps, badges, communities, lists, profiles, reports...), seeding from external Nostr, WoT, advanced search worker
- **Production**: Full monitoring (Sentry/PostHog/Web Vitals), E2E + a11y, keyboard shortcuts, onboarding, relay health/circuit breakers (BitChat-inspired resilience)
- **Performance & DX**: Feed virtualization, diagnostics panel, strict-capable TS, bundle analysis

The terminal CLI aesthetic + scarce bits for ranking + geohash location scoping make BitBoard a distinctive high-signal Nostr board client — and a stepping stone toward true Bluetooth mesh hybrid (see docs for vision).

### Quickstart

**Prerequisites**: Node.js 20+

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`

### Environment Variables

Optional environment variables (create `.env.local` for local development):

```bash
# Optional: Sentry DSN for error tracking (production)
VITE_SENTRY_DSN=your_sentry_dsn_here

# Optional: Base path for subdirectory hosting (e.g., /bitboard/)
VITE_BASE_PATH=/
```

### Scripts

```bash
# Development
npm run dev              # Start dev server
npm run preview          # Preview production build locally
npm run preview:prod     # Preview with production settings

# Build
npm run build            # Build for production
npm run build:prod       # Build with production optimizations
npm run analyze          # Build and analyze bundle size

# Quality
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
```

### Project Structure

```
├── App.tsx                 # Main app (uses features/layout context + Zustand stores)
├── features/                # Feature-level UI
│   ├── feed/               # Feed view components
│   └── layout/             # Layout components (header, sidebar, context + handlers)
├── components/              # Reusable UI components
├── hooks/                   # React hooks (feed, voting, routing, decryption)
├── services/                # Business logic (Nostr + 60+ singletons, workers)
├── stores/                  # Zustand (user, post w/ LRU, board, ui)
├── tests/                   # Test files (53+ including e2e + services coverage)
│   ├── components/
│   ├── services/
│   ├── integration/
│   └── e2e/
└── docs/                    # Documentation
```

### Deployment

BitBoard is a static React SPA and can be deployed to any static hosting service.

**Quick Deploy Options:**

- **Vercel**: `vercel` (recommended)
- **Netlify**: Connect GitHub repo in Netlify dashboard
- **Cloudflare Pages**: Connect GitHub repo in Cloudflare dashboard
- **Docker**: `docker build -t bitboard . && docker run -p 80:80 bitboard`

See [Deployment Guide](docs/deployment.md) for detailed instructions.

### Documentation

- [Architecture Overview](docs/architecture.md)
- [Services Documentation](docs/services.md)
- [Deployment Guide](docs/deployment.md)
- [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md)
- [Contributing Guide](CONTRIBUTING.md)

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/components/ErrorBoundary.test.tsx
```

### Production Build

```bash
# Build optimized production bundle
npm run build:prod

# Analyze bundle size
npm run analyze

# Preview production build
npm run preview:prod
```

### Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Requires Web Crypto API support (all modern browsers)

### License

See LICENSE file for details.

### Support

For issues, questions, or contributions, please open an issue on GitHub.
