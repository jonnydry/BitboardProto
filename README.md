## BitBoardProto

BitBoard is an experimental, terminal-styled message board built on the **Nostr** protocol.

- **Posts + boards**: topic boards and geohash-based location channels
- **Comments**: threaded discussions with edit/delete support
- **Voting**: Nostr reactions (kind 7) + local score math
- **Offline-friendly**: local caching and queued publishes
- **Performance**: feed virtualization for large timelines
- **Diagnostics**: local-only relay/queue diagnostics panel

### Quickstart

- **Prereqs**: Node.js

```bash
npm install
npm run dev
```

### Optional: Gemini link scanning

If you want link scanning/preview enrichment, create `.env.local`:

```bash
VITE_GEMINI_API_KEY=your_key_here
```

### Useful scripts

```bash
npm run dev
npm run build
npm run preview
npm run test
npm run lint
npm run format
```

### Project structure

- `App.tsx`: top-level state + routing (split into feature components)
- `features/`: feature-level UI (layout/feed)
- `components/`: reusable UI components
- `hooks/`: React hooks (feed loading, voting, routing)
- `services/`: Nostr + identity + voting + utilities
- `docs/`: architecture and service documentation

### Docs

- `docs/architecture.md`
- `docs/services.md`
- `CONTRIBUTING.md`
