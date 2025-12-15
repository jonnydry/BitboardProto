## Contributing

### Setup

- Install Node.js
- Install dependencies:

```bash
npm install
```

### Running

```bash
npm run dev
```

### Tests and quality

```bash
npm run test
npm run lint
npm run format
```

### Project conventions

- **TypeScript first**: prefer strict typing over `any`
- **Input hardening**: validate/sanitize all user content and any content parsed from Nostr events
- **Nostr immutability**: edits/deletes must be represented as companion events (don’t mutate original ids)
- **No external telemetry**: diagnostics are local-only

### Submitting changes

- Keep PRs focused and small
- Include a brief test plan in the PR description
- If you change Nostr event semantics, update `docs/architecture.md` and add/adjust unit tests


