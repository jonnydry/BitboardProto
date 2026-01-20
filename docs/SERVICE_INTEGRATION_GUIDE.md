# Service Integration Guide

This document describes where the new NIP-based services should be integrated into BitBoard's UI components.

## Overview of New Services

| Service | NIP | Purpose | Feature Flag |
|---------|-----|---------|--------------|
| `articleService` | NIP-23 | Long-form content (articles) | `ENABLE_LONG_FORM` |
| `badgeService` | NIP-58 | User achievement badges | `ENABLE_BADGES` |
| `communityService` | NIP-72 | Moderated communities | `ENABLE_COMMUNITIES` |
| `listService` | NIP-51 | Mute lists, bookmarks, follow packs | `ENABLE_LISTS` |
| `liveEventService` | NIP-53 | Live streaming events | `ENABLE_LIVE_EVENTS` |
| `wotService` | - | Web of Trust filtering | `ENABLE_WOT` |
| `zapService` | NIP-57 | Lightning Zaps | `ENABLE_ZAPS` |

---

## Integration Points

### 1. ArticleService (NIP-23)

**Purpose:** Long-form content like blog posts and articles.

**Integration Points:**

| Component | Integration |
|-----------|-------------|
| `CreatePost.tsx` | Add option to create long-form article instead of short post |
| `PostItem.tsx` | Detect and render NIP-23 articles with proper markdown formatting |
| `FeedView.tsx` | Filter/display articles separately or mixed with posts |
| `UserProfile.tsx` | Show user's published articles |
| `Sidebar.tsx` | Add "Articles" section in navigation |

**Usage Example:**
```typescript
import { articleService } from '../services/articleService';
import { FeatureFlags } from '../config';

// Only show if feature is enabled
if (FeatureFlags.ENABLE_LONG_FORM) {
  const articles = await articleService.fetchRecentArticles();
}
```

---

### 2. BadgeService (NIP-58)

**Purpose:** Display achievement badges on user profiles.

**Integration Points:**

| Component | Integration |
|-----------|-------------|
| `UserProfile.tsx` | Display user's earned and displayed badges |
| `ProfileEditor.tsx` | Allow users to select which badges to display |
| `PostItem.tsx` | Show badge icons next to author name |
| `CommentThread.tsx` | Show badge icons next to commenter names |

**Usage Example:**
```typescript
import { badgeService, BITBOARD_BADGES } from '../services/badgeService';
import { FeatureFlags } from '../config';

if (FeatureFlags.ENABLE_BADGES) {
  const badgeInfo = await badgeService.getUserBadgeInfo(pubkey);
  const displayedBadges = await badgeService.getDisplayedBadges(pubkey);
}
```

**New Component Needed:** `BadgeDisplay.tsx`
```tsx
// Component to render badge icons
interface BadgeDisplayProps {
  pubkey: string;
  size?: 'sm' | 'md' | 'lg';
}
```

---

### 3. CommunityService (NIP-72)

**Purpose:** Moderated communities with post approval workflow.

**Integration Points:**

| Component | Integration |
|-----------|-------------|
| `BoardBrowser.tsx` | Add "Communities" tab to browse moderated communities |
| `CreateBoard.tsx` | Option to create a moderated community |
| `FeedView.tsx` | Filter to show only approved posts in communities |
| `Sidebar.tsx` | Show joined communities |
| *New* `ModerationQueue.tsx` | Moderator view for pending posts |

**Usage Example:**
```typescript
import { communityService } from '../services/communityService';
import { FeatureFlags } from '../config';

if (FeatureFlags.ENABLE_COMMUNITIES) {
  const isMod = await communityService.isModerator(communityAddress, userPubkey);
  const approvedPosts = await communityService.filterApprovedPosts(communityAddress, posts);
}
```

**New Components Needed:**
- `CommunityBrowser.tsx` - Browse and join communities
- `ModerationQueue.tsx` - Moderator approval interface
- `CommunitySettings.tsx` - Community configuration

---

### 4. ListService (NIP-51)

**Purpose:** Mute lists, bookmarks, and follow packs.

**Integration Points:**

| Component | Integration |
|-----------|-------------|
| `FeedView.tsx` | Filter out posts from muted users |
| `Bookmarks.tsx` | Sync bookmarks with Nostr instead of localStorage |
| `UserProfile.tsx` | Add "Mute User" action |
| `PostItem.tsx` | Add "Mute Author" option in menu |
| *New* `FollowPacks.tsx` | Manage categorized follow lists |

**Usage Example:**
```typescript
import { listService } from '../services/listService';
import { FeatureFlags } from '../config';

if (FeatureFlags.ENABLE_LISTS) {
  listService.setUserPubkey(userPubkey);
  const isMuted = await listService.isMuted(authorPubkey);
  const filteredPosts = await listService.filterMutedAuthors(posts);
}
```

**Migration Note:** Existing `bookmarkService.ts` should be updated to use `listService` for Nostr sync.

---

### 5. LiveEventService (NIP-53)

**Purpose:** Live streaming events like AMAs and community calls.

**Integration Points:**

| Component | Integration |
|-----------|-------------|
| `Sidebar.tsx` | Show "Live Now" indicator when events are active |
| *New* `LiveEventBrowser.tsx` | Browse upcoming/live/past events |
| *New* `LiveEventViewer.tsx` | Watch live event with chat |
| *New* `CreateLiveEvent.tsx` | Schedule new live events |

**Usage Example:**
```typescript
import { liveEventService } from '../services/liveEventService';
import { FeatureFlags } from '../config';

if (FeatureFlags.ENABLE_LIVE_EVENTS) {
  const liveNow = await liveEventService.fetchLiveNow();
  const upcoming = await liveEventService.fetchUpcoming();
}
```

**Note:** This feature flag is `false` by default as it requires streaming infrastructure.

---

### 6. WoTService (Web of Trust)

**Purpose:** Filter content based on social graph distance.

**Integration Points:**

| Component | Integration |
|-----------|-------------|
| `FeedView.tsx` | Add WoT filter option (show trusted only) |
| `PostItem.tsx` | Show trust indicator next to author |
| `UserProfile.tsx` | Show trust distance and mutual follows |
| *New* `WoTSettings.tsx` | Configure trust depth and filtering |

**Usage Example:**
```typescript
import { wotService } from '../services/wotService';
import { FeatureFlags } from '../config';

if (FeatureFlags.ENABLE_WOT) {
  wotService.setUserPubkey(userPubkey);
  const trustedPosts = await wotService.filterPostsByWoT(posts, 2);
  const score = await wotService.getScore(authorPubkey);
}
```

**New Component Needed:** `TrustIndicator.tsx`
```tsx
// Visual indicator of trust level
interface TrustIndicatorProps {
  pubkey: string;
  showDistance?: boolean;
}
```

---

### 7. ZapService (NIP-57)

**Purpose:** Lightning Network tips/donations on posts.

**Integration Points:**

| Component | Integration |
|-----------|-------------|
| `PostItem.tsx` | Add Zap button with amount picker |
| `UserProfile.tsx` | Show zap total received, zap button |
| `CommentThread.tsx` | Zap button on comments |
| *New* `ZapButton.tsx` | Reusable zap button component |
| *New* `ZapModal.tsx` | Amount selection and invoice display |

**Usage Example:**
```typescript
import { zapService } from '../services/zapService';
import { FeatureFlags } from '../config';

if (FeatureFlags.ENABLE_ZAPS) {
  const { canZap, lnurl, error } = await zapService.canReceiveZaps(authorPubkey);
  if (canZap) {
    const tally = await zapService.getZapTally(postEventId);
    // Display: "⚡ 5,000 sats (10 zaps)"
  }
}
```

**New Components Needed:**
- `ZapButton.tsx` - Trigger zap flow
- `ZapModal.tsx` - Amount picker and QR code
- `ZapTally.tsx` - Display zap count/total
- `TopZappers.tsx` - Show biggest supporters

---

## Feature Flag Usage Pattern

All integrations should check the feature flag before rendering:

```tsx
import { FeatureFlags } from '../config';

function PostActions({ post }) {
  return (
    <div className="post-actions">
      {/* Always show */}
      <VoteButtons post={post} />
      <CommentButton post={post} />
      
      {/* Only if enabled */}
      {FeatureFlags.ENABLE_ZAPS && <ZapButton post={post} />}
      {FeatureFlags.ENABLE_BADGES && <BadgeDisplay pubkey={post.authorPubkey} />}
    </div>
  );
}
```

---

## Priority Order for Integration

Based on user value and implementation complexity:

1. **ZapService** - High user demand for Lightning integration
2. **WoTService** - Important for spam prevention
3. **ListService** - Improves existing bookmarks/mute functionality  
4. **BadgeService** - Gamification and reputation
5. **ArticleService** - Long-form content support
6. **CommunityService** - Moderated spaces
7. **LiveEventService** - Requires additional infrastructure

---

## Testing Considerations

Each service integration should:

1. Check feature flag before using
2. Handle service failures gracefully
3. Show loading states during async operations
4. Cache results appropriately
5. Clear caches on identity change

---

## Related Files

- `config.ts` - Feature flags configuration
- `types.ts` - Type definitions for all NIPs
- `services/nostr/NostrService.ts` - Core Nostr methods
