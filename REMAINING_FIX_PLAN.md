# BitBoard — Plan to Fix Remaining Issues

Generated 2026-05-31. See `REMAINING_WORK.md` for the older analysis.

## Inventory of remaining work

| Category | Count | Risk | Notes |
|---|---|---|---|
| Base `tsc` errors | 13 | Low | All mechanical, ~1 hr |
| Strict `tsc` errors | ~349 | Med | Mostly `noUncheckedIndexedAccess` catches, real bugs |
| `App.tsx` defines `IdentityUnlockModal` inline | 1 | Low | Extract to `components/` |
| `AppContext.tsx` 50+ dep `useMemo` | 1 | Med | Split into 2-3 contexts |
| Test coverage gaps (hooks) | ~3 hooks | Low | Add focused tests |
| NIP-44 PBKDF2 iterations (310k → 600k) | 1 | Low | Security hardening |
| No CSP meta tag | 1 | Low | Security hardening |
| Large file splits (NostrService, OnboardingFlow, CommentThread) | 3 | High | Own PRs |
| Dependency upgrades (Sentry v10, Vite v8, Tailwind v4, Zustand v5) | ~10 | High | Own PRs |

## Execution plan

### Phase 1 — Quick wins (~30 min, low risk)

1. **Fix 13 base `tsc` errors**:
   - `App.tsx(834)` — `<Bookmarks>` missing `onToggleBookmark` prop
   - `Bookmarks.tsx(414,441)` — `<PostItem>` missing `userState` prop
   - `UserProfile.tsx(646,673)` — `<PostItem>` missing `userState` prop
   - `Sidebar.test.tsx` × 6 — `baseProps` missing `knownUsers`/`decryptionFailedBoardIds`/`removeFailedDecryptionKey`
   - `accessibility.spec.ts` — drop unused `@ts-expect-error`
   - `types-verification.test.ts(251)` — `communityId` typo, remove

2. **Add CSP meta tag** to `index.html` (defense in depth)

### Phase 2 — Strict tsc first sweep (~2-3 hrs, medium risk)

Fix the strict tsc errors grouped by file pattern:

3. **`PostItem` prop interface** — `userState` was removed from `PostItemProps` (component reads from store now) but callers still pass it. Drop from call sites.

4. **`Post | undefined` / `Comment | undefined` in JSX** — `posts.find(...)` returns undefined; use early-return or fallback

5. **`string | null | undefined` → `string | undefined`** — `CreatePost.tsx(288-289)`, `EditPost.tsx(102-103)` — explicit `?? ''` or remove `null` from source

6. **`boolean | undefined` from `?? true` patterns in `Sidebar.tsx`** — 8 sites. Either:
   - Change `useUIStore` field type to required, OR
   - Add explicit `?? false` at each call site

7. **`entry` possibly undefined** in `useInfiniteScroll.ts(55)` and `usePerformance.ts(113)` — destructure guard

8. **`null` vs `undefined` in `usePostDecryption.ts(174)`** — explicit `?? ''`

9. **`(string | undefined)[]` from `tags.map()`** in `services/articleService.ts`, `services/badgeService.ts`, `services/communityService.ts`, `services/liveEventService.ts`, `services/listService.ts`, `services/nostr/eventTransforms.ts`, `services/nostr/relayQueries.ts`, `services/nostrDiscoveryService.ts` — wrap in `.filter((t): t is string => typeof t === 'string')`

10. **`Event | undefined` vs `Event | null`** in `services/nostr/{articleQueries,liveQueries,shared}.ts` — change return type or wrap

11. **`Item | undefined` in `NostrService.ts` queue loop** — add `if (!item) continue;` (already done for flush loop, but not for cleanup)

12. **NostrDiscoveryBrowser × 7 `noUncheckedIndexedAccess`** — find the array, narrow or fallback

13. **`unknown` from `Array<X>.find()` results** — `profileCache.ts(159,273,276)`, `nostrDiscoveryService.ts(433-440)` — add `if (!x) continue/return;`

14. **`votingService.ts` pool-of-votes bug** — type assertion needed at line 280 for the Web Worker callback

15. **TS18046 catch variables in `identityService.ts`** — `signed` is `unknown` because `signEventWithExtension` returns `NostrEvent | null` but we're in the new typing. The casts are now correct in my type stubs; need to revisit

16. **`hooks/useInfiniteScroll.ts(93)` RefObject null** — `loaderRef` declared as `RefObject<HTMLDivElement>` (no null) but real ref includes null. Change return type

### Phase 3 — AppContext split (~1 hr, medium risk)

17. **Split `AppContextType` into 3 smaller contexts**:
    - `DataContext` (posts, boards, postsById, sortedPosts, knownUsers, etc.)
    - `UIContext` (viewMode, theme, feedFilter, modals, etc.)
    - `ActionContext` (handlers)
    - Use a `useAppData()`, `useAppUI()`, `useAppActions()` hook trio
    - Fixes the 50+ dep useMemo issue (each context memoizes only its slice)
    - Backwards-compat shim: keep `useApp()` for now

### Phase 4 — Extract `IdentityUnlockModal` (~20 min, low risk)

18. **Move `IdentityUnlockModal` from `App.tsx` to `components/IdentityUnlockModal.tsx`**
    - Pure mechanical refactor, no behavior change
    - Cuts `App.tsx` by ~100 lines

### Phase 5 — Test coverage for hooks (~1 hr, low risk)

19. **`hooks/useNostrFeed.test.ts`** — minimal smoke test
20. **`features/layout/useAppPostMutationHandlers.test.ts`** — minimal smoke test for the seed/handleCreatePost/handleRetryPost flows

### Phase 6 — Security hardening (~20 min, low risk)

21. **Bump PBKDF2 iterations** from 310k to OWASP 2023 minimum (600k for SHA-256)
22. **Add `crossOriginIsolated`-safe CSP** to `index.html`

### Phase 7 — out of scope (own PRs)

- Dependency upgrades (Sentry v8→v10, Vite v6→v8, Tailwind v3→v4, Zustand v4→v5, lucide-react v0.554→v1, react-markdown v9→v10, vitest v2→v4)
- File splits (`NostrService.ts` 2359 lines, `OnboardingFlow.tsx` 1465 lines, `CommentThread.tsx` 1023 lines)
- `workbox.mode: 'production'` (drop Vite 6 terser workaround once we upgrade Vite)
- `AppContext` → `useShallow` migration in Zustand 5
