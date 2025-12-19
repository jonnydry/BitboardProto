## Services

This doc describes the main service modules and the responsibilities they own.

### `services/nostrService.ts`

Public entrypoint for Nostr functionality.

- **Relay management**: effective relays, relay status, retry
- **Queries**: posts/boards/comments/votes/edits/deletes
- **Publishing**: publish signed events with multi-relay attempts + queuing
- **Parsing**: convert Nostr events into app `Post`/`Comment` data

Implementation lives in `services/nostr/`:

- `services/nostr/NostrService.ts`: high-level orchestrator
- `services/nostr/profileCache.ts`: kind-0 metadata cache + fetch
- `services/nostr/eventBuilders.ts`: helpers for building BitBoard events
- `services/nostr/bitboardEventTypes.ts`: shared tag/type constants

### `services/votingService.ts`

- Builds vote events (kind 7)
- Fetches vote events and computes tallies via `services/voteMath.ts`

### `services/identityService.ts`

- Creates/imports identities
- Persists identity locally
- Exposes npub/pubkey helpers

### `services/bookmarkService.ts`

- Local-only bookmarks stored in `localStorage`

### `services/toastService.ts`

- Global toast queue + deduping
- Error toasts are mirrored into `diagnosticsService`

### `services/diagnosticsService.ts`

- Local-only ring-buffer log (stored in `localStorage`)
- Used for relay warnings/errors and UI diagnostics

### `services/inputValidator.ts`

- Validation + sanitization for user-generated content and incoming Nostr content
- Central defense against malformed events and XSS-style payloads















