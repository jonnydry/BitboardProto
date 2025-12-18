# Feature Parity Comparison: App.tsx vs AppNew.tsx

## Executive Summary

**App.tsx** (1252 lines) is the **complete, production-ready** implementation.
**AppNew.tsx** (216 lines) is an **incomplete migration** to a context-based architecture.

**Status**: AppNew.tsx is missing **11 critical features** and has **5 implementation differences**.

---

## Critical Missing Features in AppNew.tsx

### 1. ❌ **PostItem Component in Single Post View**
- **App.tsx**: Full `PostItem` component with all props (lines 1121-1139)
- **AppNew.tsx**: Placeholder div with text "Single post view - PostItem component needed" (lines 88-89)
- **Impact**: Single post view is completely broken

### 2. ❌ **Post Decryption Hook**
- **App.tsx**: Uses `usePostDecryption(filteredPosts, boardsById)` (line 267)
- **AppNew.tsx**: Missing entirely - uses `filteredPosts` directly in `sortedPosts`
- **Impact**: Encrypted posts cannot be decrypted and displayed

### 3. ❌ **Encryption Support in Event Handlers**
- **App.tsx**: Full encryption support in:
  - `handleCreatePost` (lines 357-395)
  - `handleComment` (lines 471-501)
  - `handleEditComment` (lines 603-633)
  - `handleSavePost` (lines 769-805)
- **AppNew.tsx**: No encryption handling in `useAppEventHandlers.ts`
- **Impact**: Cannot create/edit posts/comments in encrypted boards

### 4. ❌ **Complete loadMorePosts Implementation**
- **App.tsx**: Full implementation with vote fetching, edit fetching, deduplication (lines 876-968)
- **AppNew.tsx**: Placeholder `console.log('loadMorePosts called')` (line 473)
- **Impact**: Infinite scroll pagination is broken

### 5. ❌ **refreshProfileMetadata in UserProfile**
- **App.tsx**: UserProfile receives `onRefreshProfile` prop (line 1194)
- **AppNew.tsx**: Missing `onRefreshProfile` prop (line 150)
- **Impact**: Cannot refresh user profile metadata from UserProfile view

### 6. ❌ **Bookmark Removal on Post Delete**
- **App.tsx**: Calls `bookmarkService.removeBookmark(postId)` (line 857)
- **AppNew.tsx**: Commented out with note (line 454)
- **Impact**: Deleted posts remain in bookmarks

### 7. ❌ **Footer Relay Count**
- **App.tsx**: Shows `nostrService.getRelays().length` (line 1247)
- **AppNew.tsx**: Hardcoded `{0}` (line 200)
- **Impact**: Footer shows incorrect relay count

---

## Implementation Differences

### 8. ⚠️ **CreatePost activeUser Prop**
- **App.tsx**: `activeUser={userState.username}` (line 1148)
- **AppNew.tsx**: `activeUser={app.userState.identity?.npub || 'Anonymous'}` (line 101)
- **Impact**: Different username display logic - may show npub instead of displayName

### 9. ⚠️ **CreatePost availableBoards Filtering**
- **App.tsx**: `[...boards.filter(b => b.isPublic), ...locationBoards]` (line 1146)
- **AppNew.tsx**: `[...app.boards]` (line 97)
- **Impact**: Shows all boards including private ones, missing locationBoards

### 10. ⚠️ **EditPost boards Prop**
- **App.tsx**: `boards={[...boards, ...locationBoards]}` (line 1217)
- **AppNew.tsx**: `boards={app.boards}` (line 171)
- **Impact**: Cannot edit posts to move them to location boards

### 11. ⚠️ **handleCreateBoard existingIds Check**
- **App.tsx**: `[...boards, ...locationBoards]` (line 432)
- **AppNew.tsx**: `[...boards, ...boards]` (line 140) - bug: should be locationBoards
- **Impact**: May allow duplicate board IDs if location boards exist

### 12. ⚠️ **AppHeader userState Prop**
- **App.tsx**: Missing `userState` prop
- **AppNew.tsx**: Includes `userState={app.userState}` (line 36)
- **Impact**: May be intentional - check if AppHeader needs this

---

## Code Structure Comparison

### App.tsx Architecture
- **Monolithic**: All logic in one file
- **Direct state management**: useState hooks directly in component
- **Inline event handlers**: All handlers defined in component
- **Direct imports**: All services imported at top

### AppNew.tsx Architecture
- **Context-based**: Uses `AppProvider` and `useApp()` hook
- **Separated concerns**: Event handlers in `useAppEventHandlers.ts`
- **State in context**: All state managed in `AppContext.tsx`
- **Cleaner component**: AppContent is mostly presentational

---

## Migration Status

### ✅ Completed
- Context provider setup (`AppContext.tsx`)
- Event handlers extraction (`useAppEventHandlers.ts`)
- Basic view mode rendering
- Feed view integration
- Most component props wired correctly

### ❌ Incomplete
- Single post view (PostItem missing)
- Post decryption
- Encryption support in handlers
- Infinite scroll pagination
- Profile refresh functionality
- Bookmark cleanup on delete
- Footer relay count

### ⚠️ Needs Review
- CreatePost username logic
- Board filtering logic
- EditPost board selection
- handleCreateBoard duplicate check

---

## Recommendations

### Priority 1 (Critical - App Broken)
1. Add PostItem to SINGLE_BIT view
2. Add usePostDecryption hook usage
3. Implement encryption support in event handlers
4. Complete loadMorePosts implementation

### Priority 2 (Important - Features Missing)
5. Add refreshProfileMetadata to UserProfile
6. Fix bookmark removal on delete
7. Fix footer relay count

### Priority 3 (Polish - Logic Differences)
8. Review CreatePost username/board filtering
9. Fix EditPost boards prop
10. Fix handleCreateBoard existingIds bug

---

## Files to Update

1. **AppNew.tsx** - Add PostItem import and component
2. **features/layout/AppContext.tsx** - Add usePostDecryption
3. **features/layout/useAppEventHandlers.ts** - Add encryption support, complete loadMorePosts
4. **AppNew.tsx** - Fix CreatePost/EditPost props, footer relay count

---

## Testing Checklist

After migration, verify:
- [ ] Single post view displays correctly
- [ ] Encrypted posts decrypt and display
- [ ] Can create posts in encrypted boards
- [ ] Can comment in encrypted boards
- [ ] Infinite scroll loads more posts
- [ ] Profile refresh works from UserProfile
- [ ] Deleted posts removed from bookmarks
- [ ] Footer shows correct relay count
- [ ] CreatePost shows correct username
- [ ] CreatePost filters boards correctly
- [ ] EditPost includes location boards








