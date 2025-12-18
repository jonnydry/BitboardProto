## Architecture

### Overview

BitBoard is a client-side React + TypeScript app that uses Nostr relays as the primary transport.

Core concepts:

- **Posts**: Nostr kind `1` events tagged as BitBoard posts
- **Comments**: Nostr kind `1` events tagged as BitBoard comments and linked via NIP-10 `e` tags
- **Votes**: Nostr kind `7` reaction events (`+` / `-`) scoped by `e` tags
- **Boards**:
  - **Topic boards**: user-defined
  - **Geohash boards**: derived from location/geohash

### Nostr event immutability (edits/deletes)

Nostr events are immutable, so BitBoard uses companion events:

- **Post edit**: kind `1` with tag `['bb','post_edit']` and an `e` tag referencing the original post event id.
- **Comment edit**: kind `1` with tag `['bb','comment_edit']` and `e` tags referencing the root post and the edited comment.
- **Comment delete**: kind `5` (NIP-09) with tag `['bb','comment_delete']` and `e` tags referencing the root post and deleted comment.

The UI treats the **latest** edit companion event as the current content, while votes remain tied to the original post event id.

### Data flow (high level)

- **Startup**
  - Load cached posts/boards from `localStorage`
  - Initialize Nostr feed subscriptions
  - Fetch latest posts and apply vote tallies + edit companion events

- **Realtime updates**
  - Subscriptions update posts, votes, and edit/delete companion events

- **Offline/publish resilience**
  - Publish attempts are made across effective relays
  - Failed publish targets are queued and retried when relays reconnect

### Key modules

- UI entry: `App.tsx` + `features/*`
- Nostr transport + parsing: `services/nostrService.ts` (public) and `services/nostr/*` (implementation)
- Voting tallying: `services/votingService.ts` + `services/voteMath.ts`
- Identity: `services/identityService.ts`
- Input hardening: `services/inputValidator.ts`
- Local diagnostics: `services/diagnosticsService.ts`











