## Architecture

### Overview

BitBoard is a client-side React + TypeScript SPA. Nostr relays are the store and transport.

Two channel types:

- **LOCAL (geohash)** — kind `1` notes with a `g` tag. Fetch and subscribe **without** `#client:bitboard`, over a 9-cell window (center + 8 neighbors) so BitChat location notes on a cell boundary still appear. Optional `n` nickname tag (BitChat).
- **BOARDS (named)** — kind `1` BitBoard posts tagged `client=bitboard` plus `#board` / `#a`.

Bluetooth mesh is **not** implemented in this web client. Mesh stays BitChat-native.

Empty boards stay empty. Blended external-Nostr fill is off (`ENABLE_BLENDED_FEED`).

### Nostr event immutability (edits/deletes)

Nostr events are immutable, so BitBoard uses companion events:

- **Post edit**: kind `1` with tag `['bb','post_edit']` and an `e` tag referencing the original post event id.
- **Comment edit**: kind `1` with tag `['bb','comment_edit']` and `e` tags referencing the root post and the edited comment.
- **Comment delete**: kind `5` (NIP-09) with tag `['bb','comment_delete']` and `e` tags referencing the root post and deleted comment.

The UI treats the **latest** edit companion event as the current content, while votes remain tied to the original post event id.

### Votes and bits

- Votes are Nostr kind `7` reactions (`+` / `-`) scoped by `e` tags.
- **Bits** are a local daily quota in this client: spend before publish, refund on retract or failed publish. They do not prevent other clients from reacting and are not sybil-proof.
- `votedPosts` / `votedComments` persist in `localStorage` so this client does not double-spend bits on reload.

### Data flow (high level)

- **Startup**
  - Load cached posts/boards from `localStorage`
  - First-run: welcome → place (optional geolocation) → identity → complete. No default fake `b-tech` landing board.
  - Initialize Nostr feed subscriptions for the selected board or geohash
  - Fetch latest posts and apply vote tallies + edit companion events

- **Realtime updates**
  - Subscriptions update posts, votes, and edit/delete companion events

- **Offline/publish resilience**
  - Publish attempts are made across effective relays
  - Failed publish targets are queued and retried when relays reconnect

### Key modules

- UI entry: `App.tsx` + `features/*`
- Nostr transport + parsing: `services/nostr/NostrService.ts` and `services/nostr/*`
- Voting tallying: `services/votingService.ts` + `services/voteMath.ts`
- Geo / location channels: `services/geohashService.ts` (`getSearchCellSet`) + `geonetDiscoveryService.ts`
- Local-channel detection: `services/nostr/eventHelpers.ts` (`isGeohashChannelEvent`, `isLocalChannelPostEvent`)
- Identity: `services/identityService.ts`
- Input hardening: `services/inputValidator.ts`
- Local diagnostics: `services/diagnosticsService.ts`
