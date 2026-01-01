# BitBoard API Documentation

## Nostr Event Schemas

BitBoard uses custom Nostr event types and tags to implement boards, posts, comments, and voting. This document describes the event structures used.

## Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| 1 | Post/Comment | Standard Nostr text note (NIP-01) |
| 3 | Contacts | Contact list for follows (NIP-02) |
| 5 | Deletion | Event deletion (NIP-09) |
| 7 | Reaction | Vote/reaction (NIP-25) |
| 30001 | Board Definition | Parameterized replaceable event for board metadata (NIP-33) |
| 1984 | Report | Content reporting (NIP-56) |
| 10002 | Relay List | User's relay list (NIP-65) |

## Custom Tags

BitBoard uses a custom `bb` (BitBoard) tag to identify event types:

```json
["bb", "<event-type>"]
```

### Event Types:
- `post` - Original post
- `comment` - Comment on a post
- `post_edit` - Edit to a post
- `comment_edit` - Edit to a comment
- `comment_delete` - Comment deletion marker

## Event Schemas

### Post (Kind 1)

Original post on a board.

```json
{
  "kind": 1,
  "created_at": 1234567890,
  "content": "Post content in markdown",
  "tags": [
    ["bb", "post"],
    ["client", "bitboard"],
    ["board", "TECH"],
    ["title", "Post Title"],
    ["t", "technology"],
    ["t", "nostr"]
  ],
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

**Tags:**
- `bb`: `post` - Identifies as a BitBoard post
- `client`: `bitboard` - Client identifier
- `board`: Board ID (uppercase, e.g., `TECH`, `RANDOM`)
- `title`: Post title (max 200 chars)
- `t`: Hashtags (multiple allowed)
- `geohash`: (optional) Geohash for location-based boards

### Comment (Kind 1)

Comment on a post.

```json
{
  "kind": 1,
  "created_at": 1234567890,
  "content": "Comment content",
  "tags": [
    ["bb", "comment"],
    ["client", "bitboard"],
    ["e", "<post-id>", "", "root"],
    ["e", "<parent-comment-id>", "", "reply"],
    ["p", "<post-author-pubkey>"],
    ["p", "<parent-comment-author-pubkey>"]
  ],
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

**Tags (NIP-10):**
- `e` with `root` marker: References the root post
- `e` with `reply` marker: References the parent comment
- `p`: Mentioned pubkeys (post/comment authors)

### Vote (Kind 7)

Upvote or downvote on a post/comment.

```json
{
  "kind": 7,
  "created_at": 1234567890,
  "content": "+",
  "tags": [
    ["e", "<post-or-comment-id>"],
    ["p", "<author-pubkey>"]
  ],
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

**Content:**
- `+` - Upvote
- `-` - Downvote

**Cryptographic Guarantee:** One vote per pubkey per post (Nostr signature verification).

### Board Definition (Kind 30001)

Defines a custom board.

```json
{
  "kind": 30001,
  "created_at": 1234567890,
  "content": "Board description",
  "tags": [
    ["d", "MYBOARD"],
    ["name", "My Board"],
    ["description", "A custom board for..."],
    ["type", "topic"],
    ["client", "bitboard"]
  ],
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

**Tags:**
- `d`: Board identifier (unique per pubkey)
- `name`: Display name
- `description`: Board description
- `type`: `topic` or `geohash` or `encrypted`

### Encrypted Board Post

Posts on encrypted boards are encrypted with AES-256-GCM using a password.

```json
{
  "kind": 1,
  "created_at": 1234567890,
  "content": "IV:ciphertext",
  "tags": [
    ["bb", "post"],
    ["board", "SECRET_BOARD"],
    ["encrypted", "true"],
    ["title", "IV:encrypted_title"]
  ],
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

**Encryption Format:** `<IV (base64)>:<ciphertext (base64)>`

### Post Edit (Kind 1)

Companion event for editing a post.

```json
{
  "kind": 1,
  "created_at": 1234567890,
  "content": "Updated post content",
  "tags": [
    ["bb", "post_edit"],
    ["e", "<original-post-id>"],
    ["title", "Updated Title"]
  ],
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

### Comment Delete (Kind 1)

Companion event for deleting a comment (soft delete).

```json
{
  "kind": 1,
  "created_at": 1234567890,
  "content": "",
  "tags": [
    ["bb", "comment_delete"],
    ["e", "<comment-id>"]
  ],
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

### Report (Kind 1984)

Report inappropriate content (NIP-56).

```json
{
  "kind": 1984,
  "created_at": 1234567890,
  "content": "Spam content",
  "tags": [
    ["e", "<reported-event-id>"],
    ["p", "<reported-pubkey>"],
    ["report", "spam"]
  ],
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

**Report Types:**
- `spam` - Spam/commercial content
- `illegal` - Illegal content
- `nsfw` - Not safe for work
- `impersonation` - Impersonation
- `other` - Other violations

## Subscription Filters

### Get Posts for a Board

```javascript
{
  kinds: [1],
  "#bb": ["post"],
  "#board": ["TECH"],
  limit: 50,
  since: <unix-timestamp>
}
```

### Get Comments for a Post

```javascript
{
  kinds: [1],
  "#bb": ["comment"],
  "#e": ["<post-id>"],
  limit: 100
}
```

### Get Votes for a Post

```javascript
{
  kinds: [7],
  "#e": ["<post-id>"]
}
```

### Get User's Posts

```javascript
{
  kinds: [1],
  authors: ["<pubkey>"],
  "#bb": ["post"],
  limit: 50
}
```

### Get Board Definitions

```javascript
{
  kinds: [30001],
  limit: 100
}
```

## Client Identifier

All BitBoard events include:
```json
["client", "bitboard"]
```

This helps identify events created by BitBoard for filtering and analytics.

## Rate Limiting

BitBoard implements client-side rate limiting:
- Posts: 5 per minute
- Votes: 10 per minute
- Comments: 10 per minute

## Best Practices

1. **Always verify signatures** - Nostr guarantees cryptographic authenticity
2. **Validate event structure** - Check for required tags before processing
3. **Handle missing data** - Events may be deleted or unavailable
4. **Respect user privacy** - Never expose nsec or encryption keys
5. **Cache intelligently** - Use LRU caches for posts and votes
6. **Debounce subscriptions** - Avoid hammering relays with duplicate requests

## Error Handling

Relays may return `OK` messages:
```json
["OK", "<event-id>", false, "error: reason"]
```

Common errors:
- `duplicate:` - Event already exists
- `blocked:` - Event rejected by relay policy
- `rate-limited:` - Too many requests
- `invalid:` - Malformed event

## Future Extensions

Planned features:
- **Polls** (NIP-69) - On-chain voting
- **Zaps** (NIP-57) - Lightning tips for posts
- **Long-form** (NIP-23) - Article-style posts
- **Live Chat** (NIP-28) - Real-time chat channels
