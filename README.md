## BitBoard

BitBoard is a terminal-styled message board built on the **Nostr** protocol. Create topic boards, location-based channels, and encrypted discussions in a retro terminal aesthetic.

### Features

- **Posts + boards**: topic boards and geohash-based location channels
- **Comments**: threaded discussions with edit/delete support
- **Voting**: Nostr reactions (kind 7) + local score math
- **Encryption**: AES-256-GCM encrypted boards for private discussions
- **Offline-friendly**: local caching and queued publishes
- **Performance**: feed virtualization for large timelines
- **Diagnostics**: local-only relay/queue diagnostics panel

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
# Optional: Gemini API key for link scanning/preview enrichment
VITE_GEMINI_API_KEY=your_key_here

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
├── AppNew.tsx              # Main app component (context-based)
├── features/                # Feature-level UI
│   ├── feed/               # Feed view components
│   └── layout/             # Layout components (header, sidebar, context)
├── components/              # Reusable UI components
├── hooks/                   # React hooks (feed, voting, routing)
├── services/                # Business logic (Nostr, identity, encryption)
├── tests/                   # Test files
│   ├── components/         # Component tests
│   ├── integration/        # Integration tests
│   └── utils/              # Test utilities
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
