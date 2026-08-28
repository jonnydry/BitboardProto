## BitBoard

A terminal-styled board client for **Nostr**, with **BitChat-compatible local channels**.

Two rooms:

- **LOCAL** — geohash channels. Kind-1 notes with a `g` tag, including BitChat location notes on the internet. This web app does **not** speak Bluetooth mesh; that stays in the BitChat app.
- **BOARDS** — named topic boards. BitBoard posts are kind-1 notes tagged `client=bitboard` plus a board id.

Empty stays empty. There is no blended Damus costume filling quiet boards.

### What you need

A Nostr key to post and vote. Guests can read. Relays store events; this app is a static client.

**Bits** are a local daily quota in this browser that gates kind-7 reactions here. Other clients can still react. Bits are not a uniqueness token and not sybil-proof.

### Quickstart

**Prerequisites**: Node.js 20+

```bash
npm install
npm run dev
```

The app is at `http://localhost:3000`

### Environment Variables

Optional (`.env.local`):

```bash
# Optional: Sentry DSN for error tracking (production)
VITE_SENTRY_DSN=your_sentry_dsn_here

# Optional: Base path for subdirectory hosting (e.g., /bitboard/)
VITE_BASE_PATH=/
```

### Scripts

```bash
npm run dev              # Start dev server
npm run preview          # Preview production build locally
npm run build            # Build for production
npm test                 # Run tests
npm run lint             # Run ESLint
npm run typecheck        # Typecheck
```

### Project Structure

```
├── App.tsx                 # Main app (features/layout context + Zustand stores)
├── features/               # Feed + layout
├── components/             # Shared UI
├── hooks/                  # Feed, voting, routing
├── services/               # Nostr + other services
│   └── nostr/              # Relays, event builders, feed
├── stores/                 # Zustand (user, post, board, ui)
├── tests/
└── docs/
```

### Deployment

Static React SPA. See [Deployment Guide](docs/deployment.md).

### Documentation

- [Architecture Overview](docs/architecture.md)
- [Services Documentation](docs/services.md)
- [Deployment Guide](docs/deployment.md)
- [Contributing Guide](CONTRIBUTING.md)

### License

See LICENSE file for details.
