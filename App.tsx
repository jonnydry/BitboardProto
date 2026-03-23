import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { ToastHost } from './components/ToastHost';
import { SEOHead } from './components/SEOHead';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { OnboardingFlow } from './components/OnboardingFlow';
import { OfflineBanner } from './components/OfflineBanner';
import { ConsentBanner } from './components/ConsentBanner';
import { AppProvider, useApp } from './features/layout/AppContext';
import { AppHeader } from './features/layout/AppHeader';
import { Sidebar } from './features/layout/Sidebar';
import {
  DesktopNavChrome,
  readStoredDesktopNavOpen,
  writeStoredDesktopNavOpen,
} from './features/layout/DesktopNavChrome';
import { MobileNav } from './features/layout/MobileNav';
import { MobileDrawer } from './features/layout/MobileDrawer';
import { MemoizedFeedView as FeedView } from './features/feed/FeedView';
import { FeedEndMarker } from './features/feed/feedParts';
import { FeedNewBitFab } from './features/feed/FeedNewBitFab';
import { NotificationCenterV2 } from './components/NotificationCenterV2';
import { PostDetailPage } from './components/PostDetailPage';
import { SeedToBitBoardModal } from './components/SeedToBitBoardModal';
import { SeedIdentityRequiredModal } from './components/SeedIdentityRequiredModal';
import { AppModal } from './components/AppModal';
import { ViewMode } from './types';
import { nostrService } from './services/nostr/NostrService';
import { keyboardShortcutsService } from './services/keyboardShortcutsService';
import { analyticsService, AnalyticsEvents } from './services/analyticsService';
import { sentryService } from './services/sentryService';
import type { Notification } from './services/notificationService';
import { identityService } from './services/identityService';
import {
  clearSessionPassphrase,
  readSessionPassphrase,
  writeSessionPassphrase,
} from './services/sessionPassphrase';
import { useUIStore } from './stores/uiStore';
import { useUserStore } from './stores/userStore';
import { usePostStore } from './stores/postStore';
import { useBoardStore } from './stores/boardStore';
import { navigateFromNotificationDeepLink } from './features/layout/appDeepLinks';

// Lazy load components that are only used in specific views
const IdentityManager = lazy(() =>
  import('./components/IdentityManager').then((module) => ({ default: module.IdentityManager })),
);
const RelaySettings = lazy(() =>
  import('./components/RelaySettings').then((module) => ({ default: module.RelaySettings })),
);
const CreatePost = lazy(() =>
  import('./components/CreatePost').then((module) => ({ default: module.CreatePost })),
);
const CreateBoard = lazy(() =>
  import('./components/CreateBoard').then((module) => ({ default: module.CreateBoard })),
);
const LocationSelector = lazy(() =>
  import('./components/LocationSelector').then((module) => ({ default: module.LocationSelector })),
);
const UserProfile = lazy(() =>
  import('./components/UserProfile').then((module) => ({ default: module.UserProfile })),
);
const Bookmarks = lazy(() =>
  import('./components/Bookmarks').then((module) => ({ default: module.Bookmarks })),
);
const EditPost = lazy(() =>
  import('./components/EditPost').then((module) => ({ default: module.EditPost })),
);
const BoardBrowser = lazy(() =>
  import('./components/BoardBrowser').then((module) => ({ default: module.BoardBrowser })),
);
const ExternalCommunitiesBrowser = lazy(() =>
  import('./components/ExternalCommunitiesBrowser').then((module) => ({
    default: module.ExternalCommunitiesBrowser,
  })),
);
const NostrDiscoveryBrowser = lazy(() =>
  import('./components/NostrDiscoveryBrowser').then((module) => ({
    default: module.NostrDiscoveryBrowser,
  })),
);
const PrivacyPolicy = lazy(() =>
  import('./components/PrivacyPolicy').then((module) => ({ default: module.PrivacyPolicy })),
);
const TermsOfService = lazy(() =>
  import('./components/TermsOfService').then((module) => ({ default: module.TermsOfService })),
);
const About = lazy(() =>
  import('./components/About').then((module) => ({ default: module.About })),
);
const Settings = lazy(() =>
  import('./components/Settings').then((module) => ({ default: module.Settings })),
);

import { PostSkeleton } from './components/PostSkeleton';
import {
  UserProfileSkeleton as _UserProfileSkeleton,
  BoardListSkeleton as _BoardListSkeleton,
  NotificationListSkeleton as _NotificationListSkeleton,
  PageSkeleton as _PageSkeleton,
} from './components/LoadingSkeletons';

// Default loading fallback
const LoadingFallback = () => (
  <div className="flex items-center justify-center py-8">
    <div className="motion-safe:animate-pulse text-terminal-dim uppercase tracking-wider">
      LOADING...
    </div>
  </div>
);

const IdentityUnlockModal = (props: {
  isMigration: boolean;
  passphrase: string;
  confirmPassphrase: string;
  error: string | null;
  isSubmitting: boolean;
  rememberSession: boolean;
  onPassphraseChange: (value: string) => void;
  onConfirmPassphraseChange: (value: string) => void;
  onRememberSessionChange: (value: boolean) => void;
  onSubmit: () => void;
  onReset: () => void;
}) => (
  <div className="ui-overlay z-[110] flex items-center justify-center px-4 font-mono text-terminal-text">
    <div className="ui-surface-modal max-w-md p-6">
      <h2 className="font-display text-2xl font-semibold text-terminal-text">
        {props.isMigration ? 'Secure Your Identity' : 'Unlock Identity'}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-terminal-dim">
        {props.isMigration
          ? 'BitBoard no longer stores the unlock key in localStorage. Set a passphrase to re-encrypt your existing identity securely.'
          : 'Enter your identity passphrase to decrypt your stored keypair on this device.'}
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!props.isSubmitting) props.onSubmit();
        }}
      >
        <input
          type="password"
          value={props.passphrase}
          onChange={(e) => props.onPassphraseChange(e.target.value)}
          autoComplete="current-password"
          className="ui-input"
          placeholder={props.isMigration ? 'Create a passphrase' : 'Enter passphrase'}
        />

        {props.isMigration && (
          <input
            type="password"
            value={props.confirmPassphrase}
            onChange={(e) => props.onConfirmPassphraseChange(e.target.value)}
            autoComplete="new-password"
            className="ui-input"
            placeholder="Repeat passphrase"
          />
        )}

        <label className="flex items-start gap-2 cursor-pointer text-xs leading-snug text-terminal-dim">
          <input
            type="checkbox"
            checked={props.rememberSession}
            onChange={(e) => props.onRememberSessionChange(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border border-terminal-dim bg-terminal-bg accent-terminal-text"
          />
          <span>
            Remember for this browser tab — skip unlock after refresh until you close the tab or
            reset identity (passphrase stored in session only, not on disk).
          </span>
        </label>

        <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-3 text-xs leading-relaxed text-terminal-dim font-mono">
          If you forget this passphrase, BitBoard cannot recover your locally stored private key.
        </div>

        {props.error && (
          <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-3 text-sm text-terminal-alert font-mono">
            {props.error}
          </div>
        )}

        <button
          type="submit"
          disabled={props.isSubmitting}
          className="ui-button-primary w-full py-3 disabled:opacity-60"
        >
          {props.isSubmitting
            ? props.isMigration
              ? 'Securing...'
              : 'Unlocking...'
            : props.isMigration
              ? 'Secure Identity'
              : 'Unlock Identity'}
        </button>

        <button
          type="button"
          onClick={props.onReset}
          disabled={props.isSubmitting}
          className="ui-button-secondary w-full py-3 text-xs hover:border-terminal-alert hover:text-terminal-alert disabled:opacity-60"
        >
          Reset Local Identity
        </button>
      </form>
    </div>
  </div>
);

// Main App component that uses context
const AppContent: React.FC = () => {
  const app = useApp();
  const handleIdentityChange = useUserStore((s) => s.handleIdentityChange);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const [desktopNavOpen, setDesktopNavOpenState] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px)').matches ? readStoredDesktopNavOpen() : false;
  });
  const setDesktopNavOpen = (open: boolean) => {
    setDesktopNavOpenState(open);
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      writeStoredDesktopNavOpen(open);
    }
  };
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showIdentityUnlock, setShowIdentityUnlock] = useState(false);
  const [identityUnlockMode, setIdentityUnlockMode] = useState<'unlock' | 'migrate'>('unlock');
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [unlockPassphraseConfirm, setUnlockPassphraseConfirm] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlockingIdentity, setIsUnlockingIdentity] = useState(false);
  const [rememberSessionUnlock, setRememberSessionUnlock] = useState(false);
  const [identityEntryIntent, setIdentityEntryIntent] = useState<'generate' | 'import' | null>(
    null,
  );
  const [lastNonComposeViewMode, setLastNonComposeViewMode] = useState<ViewMode>(ViewMode.FEED);
  const keyboardModalStateRef = React.useRef({ showKeyboardHelp: false, showOnboarding: false });
  const navigateToBoard = app.navigateToBoard;
  const setSelectedBitId = usePostStore((s) => s.setSelectedPostId);
  const setActiveBoardId = useBoardStore((s) => s.setActiveBoardId);
  const setProfileUser = useUIStore((s) => s.setProfileUser);
  const bookmarkedIds = useUIStore((s) => s.bookmarkedIds);
  const reportedPostIds = useUIStore((s) => s.reportedPostIds);
  const hasMorePosts = useUIStore((s) => s.hasMorePosts);
  const showCreatePostModal = isDesktop && app.viewMode === ViewMode.CREATE;
  const mainViewMode = showCreatePostModal ? lastNonComposeViewMode : app.viewMode;

  const showFeedEndIntegrated = useMemo(() => {
    const canPaginate = !app.activeBoard || app.activeBoard.source !== 'nostr-community';
    const showHasMore = hasMorePosts && canPaginate;
    return (
      mainViewMode === ViewMode.FEED &&
      !app.isInitialLoading &&
      app.sortedPosts.length > 0 &&
      !showHasMore
    );
  }, [mainViewMode, app.isInitialLoading, app.sortedPosts.length, app.activeBoard, hasMorePosts]);

  useEffect(() => {
    keyboardModalStateRef.current = { showKeyboardHelp, showOnboarding };
  }, [showKeyboardHelp, showOnboarding]);

  useEffect(() => {
    if (app.viewMode !== ViewMode.CREATE) {
      setLastNonComposeViewMode(app.viewMode);
    }
  }, [app.viewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const syncDesktopNavState = () => {
      setIsDesktop(mediaQuery.matches);

      if (!mediaQuery.matches) {
        setDesktopNavOpenState(false);
        return;
      }

      setDesktopNavOpenState(readStoredDesktopNavOpen());
    };

    syncDesktopNavState();
    mediaQuery.addEventListener('change', syncDesktopNavState);

    return () => mediaQuery.removeEventListener('change', syncDesktopNavState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await identityService.getIdentityAsync();
      } catch {
        // ignore
      }
      if (cancelled) return;

      if (identityService.needsMigration()) {
        setIdentityUnlockMode('migrate');
        setShowIdentityUnlock(true);
        return;
      }

      if (identityService.needsPassphrase()) {
        const cached = readSessionPassphrase();
        if (cached) {
          const ok = await identityService.unlockWithPassphrase(cached);
          if (cancelled) return;
          if (ok) {
            const unlockedIdentity = await identityService.getIdentityAsync();
            if (unlockedIdentity) {
              handleIdentityChange(unlockedIdentity);
            }
            return;
          }
          clearSessionPassphrase();
        }
        setIdentityUnlockMode('unlock');
        setShowIdentityUnlock(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handleIdentityChange]);

  const handleIdentityUnlock = async () => {
    const passphrase = unlockPassphrase.trim();
    if (!passphrase) {
      setUnlockError('Passphrase is required.');
      return;
    }
    if (identityUnlockMode === 'migrate' && passphrase !== unlockPassphraseConfirm.trim()) {
      setUnlockError('Passphrases do not match.');
      return;
    }

    setIsUnlockingIdentity(true);
    setUnlockError(null);

    try {
      const ok =
        identityUnlockMode === 'migrate'
          ? await identityService.migrateWithPassphrase(passphrase)
          : await identityService.unlockWithPassphrase(passphrase);

      if (!ok) {
        setUnlockError(
          identityUnlockMode === 'migrate'
            ? 'Failed to secure identity with that passphrase.'
            : 'Incorrect passphrase.',
        );
        return;
      }

      const unlockedIdentity = await identityService.getIdentityAsync();
      if (unlockedIdentity) {
        handleIdentityChange(unlockedIdentity);
      }

      if (rememberSessionUnlock) {
        writeSessionPassphrase(passphrase);
      } else {
        clearSessionPassphrase();
      }

      setUnlockPassphrase('');
      setUnlockPassphraseConfirm('');
      setRememberSessionUnlock(false);
      setShowIdentityUnlock(false);
    } finally {
      setIsUnlockingIdentity(false);
    }
  };

  const handleResetLockedIdentity = () => {
    identityService.clearIdentity();
    handleIdentityChange(null);
    setUnlockPassphrase('');
    setUnlockPassphraseConfirm('');
    setRememberSessionUnlock(false);
    setUnlockError(null);
    setShowIdentityUnlock(false);
  };

  // Initialize keyboard shortcuts
  useEffect(() => {
    keyboardShortcutsService.initialize();

    // Register shortcuts
    keyboardShortcutsService.register({
      key: '?',
      shift: true,
      description: 'Show keyboard shortcuts',
      category: 'general',
      action: () => setShowKeyboardHelp(true),
    });

    keyboardShortcutsService.register({
      key: 'g',
      description: 'Go to feed',
      category: 'navigation',
      action: () => {
        useUIStore.getState().setViewMode(ViewMode.FEED);
        navigateToBoard(null);
      },
    });

    keyboardShortcutsService.register({
      key: 'c',
      description: 'Create new post',
      category: 'navigation',
      action: () => {
        if (useUserStore.getState().userState.identity) {
          useUIStore.getState().setViewMode(ViewMode.CREATE);
        }
      },
    });

    keyboardShortcutsService.register({
      key: 'b',
      description: 'Browse boards',
      category: 'navigation',
      action: () => useUIStore.getState().setViewMode(ViewMode.BROWSE_BOARDS),
    });

    keyboardShortcutsService.register({
      key: 'e',
      description: 'Discover Nostr content',
      category: 'navigation',
      action: () => useUIStore.getState().setViewMode(ViewMode.DISCOVER_NOSTR),
    });

    const focusSearchInput = () => {
      const searchInput = document.querySelector('input[data-search-input]') as HTMLInputElement;
      searchInput?.focus();
    };

    keyboardShortcutsService.register({
      key: 's',
      description: 'Search',
      category: 'navigation',
      action: focusSearchInput,
    });

    keyboardShortcutsService.register({
      key: '/',
      description: 'Focus search',
      category: 'navigation',
      action: focusSearchInput,
    });

    keyboardShortcutsService.register({
      key: 'Escape',
      description: 'Close modal/dialog',
      category: 'navigation',
      action: () => {
        const currentState = keyboardModalStateRef.current;
        const currentViewMode = useUIStore.getState().viewMode;

        if (currentState.showKeyboardHelp) setShowKeyboardHelp(false);
        else if (currentState.showOnboarding) setShowOnboarding(false);
        else if (currentViewMode !== ViewMode.FEED)
          useUIStore.getState().setViewMode(ViewMode.FEED);
      },
    });

    return () => keyboardShortcutsService.destroy();
  }, [navigateToBoard]);

  // Check for first-time users
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('bitboard_onboarding_complete');
    if (!hasSeenOnboarding && !app.userState.identity) {
      setShowOnboarding(true);
      analyticsService.track(AnalyticsEvents.ONBOARDING_STARTED);
    }
  }, [app.userState.identity]);

  // Track identity creation
  useEffect(() => {
    if (app.userState.identity) {
      const rawPubkey = app.userState.identity.pubkey;
      const username = app.userState.username || 'Anonymous';

      // Hash the pubkey before sending to Sentry to avoid associating a
      // pseudonymous Nostr identity with error reports, IP addresses, and
      // browser fingerprints stored on third-party infrastructure.
      void crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawPubkey)).then((hashBuf) => {
        const hashHex = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        sentryService.setUser({ id: hashHex, username });
      });

      analyticsService.identify(rawPubkey, {
        username: username,
        createdAt: new Date().toISOString(),
      });
    }
  }, [app.userState.identity, app.userState.username]);

  const handleOnboardingComplete = () => {
    localStorage.setItem('bitboard_onboarding_complete', 'true');
    setShowOnboarding(false);
    analyticsService.track(AnalyticsEvents.ONBOARDING_COMPLETED);
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem('bitboard_onboarding_complete', 'true');
    setShowOnboarding(false);
    analyticsService.track(AnalyticsEvents.ONBOARDING_SKIPPED);
  };

  useEffect(() => {
    if (app.viewMode !== ViewMode.IDENTITY) {
      setIdentityEntryIntent(null);
    }
  }, [app.viewMode]);

  const handleNotificationNavigate = (deepLink: Notification['deepLink']) => {
    navigateFromNotificationDeepLink(deepLink, {
      setActiveBoardId,
      setSelectedBitId,
      setProfileUser,
      setViewMode: app.setViewMode,
    });
  };

  return (
    <>
      {showIdentityUnlock && (
        <IdentityUnlockModal
          isMigration={identityUnlockMode === 'migrate'}
          passphrase={unlockPassphrase}
          confirmPassphrase={unlockPassphraseConfirm}
          error={unlockError}
          isSubmitting={isUnlockingIdentity}
          rememberSession={rememberSessionUnlock}
          onPassphraseChange={setUnlockPassphrase}
          onConfirmPassphraseChange={setUnlockPassphraseConfirm}
          onRememberSessionChange={setRememberSessionUnlock}
          onSubmit={handleIdentityUnlock}
          onReset={handleResetLockedIdentity}
        />
      )}

      {/* SEO meta tags */}
      <SEOHead />

      {/* Keyboard shortcuts help modal */}
      <KeyboardShortcutsHelp isOpen={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />

      {/* Onboarding flow for new users */}
      <OnboardingFlow
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
        onIdentityChange={handleIdentityChange}
      />

      <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono selection:bg-terminal-text selection:text-black relative overflow-x-clip">
        <ToastHost />
        {/* Offline Status Banner */}
        <OfflineBanner />
        {/* Privacy Consent Banner */}
        <ConsentBanner />
        {/* Scanline Overlay */}
        <div className="scanlines fixed inset-0 pointer-events-none z-[130]"></div>

        {/* Mobile Drawer */}
        <MobileDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          viewMode={app.viewMode}
          activeBoardId={app.activeBoardId}
          onSetViewMode={app.setViewMode}
          onNavigateGlobal={() => app.navigateToBoard(null)}
          identity={app.userState.identity || undefined}
          userState={app.userState}
          bookmarkedCount={(app.bookmarkedIds ?? []).length}
          isNostrConnected={app.isNostrConnected}
        >
          <Sidebar
            userState={app.userState}
            setUserState={app.setUserState}
            theme={app.theme}
            setTheme={app.setTheme}
            getThemeColor={app.getThemeColor}
            isNostrConnected={app.isNostrConnected}
            viewMode={app.viewMode}
            activeBoardId={app.activeBoardId}
            feedFilter={app.feedFilter}
            setFeedFilter={app.setFeedFilter}
            topicBoards={app.topicBoards ?? []}
            externalCommunities={app.externalCommunities ?? []}
            geohashBoards={app.geohashBoards ?? []}
            boardsById={app.boardsById ?? new Map()}
            decryptionFailedBoardIds={app.decryptionFailedBoardIds}
            removeFailedDecryptionKey={app.removeFailedDecryptionKey}
            navigateToBoard={app.navigateToBoard}
            onSetViewMode={app.setViewMode}
            onRequestCloseNav={() => setIsDrawerOpen(false)}
            layout="drawer"
          />
        </MobileDrawer>

        <DesktopNavChrome
          drawerOpen={desktopNavOpen}
          onCloseDrawer={() => setDesktopNavOpen(false)}
          onOpenDrawer={() => setDesktopNavOpen(true)}
        >
          <Sidebar
            userState={app.userState}
            setUserState={app.setUserState}
            theme={app.theme}
            setTheme={app.setTheme}
            getThemeColor={app.getThemeColor}
            isNostrConnected={app.isNostrConnected}
            viewMode={app.viewMode}
            activeBoardId={app.activeBoardId}
            feedFilter={app.feedFilter}
            setFeedFilter={app.setFeedFilter}
            topicBoards={app.topicBoards ?? []}
            externalCommunities={app.externalCommunities ?? []}
            geohashBoards={app.geohashBoards ?? []}
            boardsById={app.boardsById ?? new Map()}
            decryptionFailedBoardIds={app.decryptionFailedBoardIds}
            removeFailedDecryptionKey={app.removeFailedDecryptionKey}
            navigateToBoard={app.navigateToBoard}
            onSetViewMode={app.setViewMode}
            onRequestCloseNav={() => setDesktopNavOpen(false)}
            layout="drawer"
          />
        </DesktopNavChrome>

        <div className="relative z-10 mx-auto max-w-[1174px] px-4 py-3 pb-28 md:px-6 md:py-6 md:pb-2">
          <AppHeader onOpenDrawer={() => setIsDrawerOpen(true)} />

          <div className="grid grid-cols-1 gap-4 py-[5px]">
            <main className="min-w-0">
              {/* Feed View */}
              {mainViewMode === ViewMode.FEED && (
                <FeedView
                  sortedPosts={app.sortedPosts}
                  getBoardName={app.getBoardName}
                  knownUsers={app.knownUsers}
                  loaderRef={app.loaderRef}
                  isLoadingMore={app.isLoadingMore}
                  isInitialLoading={app.isInitialLoading}
                  isNostrConnected={app.isNostrConnected}
                  onVote={app.handleVote}
                  onComment={app.handleComment}
                  onEditComment={app.handleEditComment}
                  onDeleteComment={app.handleDeleteComment}
                  onCommentVote={app.handleCommentVote}
                  onDeletePost={app.handleDeletePost}
                  onToggleBookmark={app.handleToggleBookmark}
                  onSeedPost={app.requestSeedPost}
                  onToggleMute={app.toggleMute}
                  isMuted={app.isMuted}
                  onRetryPost={app.handleRetryPost}
                />
              )}

              {/* Single Post View */}
              {mainViewMode === ViewMode.SINGLE_BIT && (
                <div className="animate-fade-in">
                  {app.selectedPost ? (
                    <PostDetailPage
                      post={app.selectedPost}
                      boardName={app.getBoardName(app.selectedPost.id)}
                      userState={app.userState}
                      knownUsers={app.knownUsers}
                      onVote={app.handleVote}
                      onComment={app.handleComment}
                      onEditComment={app.handleEditComment}
                      onDeleteComment={app.handleDeleteComment}
                      onCommentVote={app.handleCommentVote}
                      onViewProfile={app.handleViewProfile}
                      onEditPost={app.handleEditPost}
                      onDeletePost={app.handleDeletePost}
                      onTagClick={app.handleTagClick}
                      onToggleBookmark={app.handleToggleBookmark}
                      onSeedPost={app.requestSeedPost}
                      onRetryPost={app.handleRetryPost}
                      onBack={app.returnToFeed}
                      isBookmarked={bookmarkedIds.includes(app.selectedPost.id)}
                      hasReported={reportedPostIds.includes(app.selectedPost.id)}
                    />
                  ) : (
                    <PostSkeleton />
                  )}
                </div>
              )}

              {/* Notifications View */}
              {mainViewMode === ViewMode.NOTIFICATIONS && (
                <div className="animate-fade-in">
                  <NotificationCenterV2
                    onClose={() => app.setViewMode(ViewMode.FEED)}
                    onNavigate={handleNotificationNavigate}
                  />
                </div>
              )}

              {/* Other views would be implemented here */}
              {mainViewMode === ViewMode.CREATE && !isDesktop && (
                <Suspense fallback={<LoadingFallback />}>
                  <CreatePost
                    availableBoards={[
                      ...app.boards.filter((b) => b.isPublic && !b.isReadOnly),
                      ...app.locationBoards,
                    ]}
                    currentBoardId={app.activeBoardId}
                    onSubmit={app.handleCreatePost}
                    onCancel={() => app.setViewMode(ViewMode.FEED)}
                    activeUser={app.userState.username}
                    userPubkey={app.userState.identity?.pubkey}
                  />
                </Suspense>
              )}
              {mainViewMode === ViewMode.CREATE_BOARD && (
                <Suspense fallback={<LoadingFallback />}>
                  <CreateBoard
                    onSubmit={app.handleCreateBoard}
                    onCancel={() => app.setViewMode(ViewMode.FEED)}
                    identity={app.userState.identity || undefined}
                    onConnectIdentity={() => app.setViewMode(ViewMode.IDENTITY)}
                  />
                </Suspense>
              )}
              {mainViewMode === ViewMode.BROWSE_BOARDS && (
                <Suspense fallback={<LoadingFallback />}>
                  <BoardBrowser
                    topicBoards={app.topicBoards ?? []}
                    posts={app.posts ?? []}
                    onNavigateToBoard={app.navigateToBoard}
                    onSetViewMode={app.setViewMode}
                    onClose={() => app.setViewMode(ViewMode.FEED)}
                  />
                </Suspense>
              )}
              {mainViewMode === ViewMode.DISCOVER_NOSTR && (
                <Suspense fallback={<LoadingFallback />}>
                  <NostrDiscoveryBrowser
                    externalCommunities={app.externalCommunities ?? []}
                    onNavigateToBoard={app.navigateToBoard}
                    onJoinNostrCommunity={app.joinNostrCommunity}
                    onClose={() => app.setViewMode(ViewMode.FEED)}
                    onSeedPost={app.requestSeedPost}
                  />
                </Suspense>
              )}
              {mainViewMode === ViewMode.EXTERNAL_COMMUNITIES && (
                <Suspense fallback={<LoadingFallback />}>
                  <ExternalCommunitiesBrowser
                    externalCommunities={app.externalCommunities ?? []}
                    onNavigateToBoard={app.navigateToBoard}
                    onJoinNostrCommunity={app.joinNostrCommunity}
                    onClose={() => app.setViewMode(ViewMode.FEED)}
                    onSeedPost={app.requestSeedPost}
                  />
                </Suspense>
              )}
              {mainViewMode === ViewMode.IDENTITY && (
                <Suspense fallback={<LoadingFallback />}>
                  <IdentityManager
                    onIdentityChange={handleIdentityChange}
                    onClose={() => app.setViewMode(ViewMode.FEED)}
                    onViewProfile={app.handleViewProfile}
                    initialIntent={identityEntryIntent ?? undefined}
                  />
                </Suspense>
              )}
              {mainViewMode === ViewMode.RELAYS && (
                <Suspense fallback={<LoadingFallback />}>
                  <RelaySettings onClose={() => app.setViewMode(ViewMode.FEED)} />
                </Suspense>
              )}
              {mainViewMode === ViewMode.LOCATION && (
                <Suspense fallback={<LoadingFallback />}>
                  <LocationSelector
                    onSelectBoard={(board) => {
                      // Add board to location boards if not already present
                      app.setLocationBoards((prev) => {
                        if (prev.some((b) => b.id === board.id)) return prev;
                        return [...prev, board];
                      });
                      // Navigate to the selected board
                      app.navigateToBoard(board.id);
                      app.setViewMode(ViewMode.FEED);
                    }}
                    onClose={() => app.setViewMode(ViewMode.FEED)}
                  />
                </Suspense>
              )}
              {mainViewMode === ViewMode.USER_PROFILE && app.profileUser && (
                <Suspense fallback={<LoadingFallback />}>
                  <UserProfile
                    onToggleBookmark={app.handleToggleBookmark}
                    knownUsers={app.knownUsers}
                    onVote={app.handleVote}
                    onComment={app.handleComment}
                    onEditComment={app.handleEditComment}
                    onDeleteComment={app.handleDeleteComment}
                    onCommentVote={app.handleCommentVote}
                    onRefreshProfile={(pubkey) => app.refreshProfileMetadata([pubkey])}
                    onDeletePost={app.handleDeletePost}
                  />
                </Suspense>
              )}
              {mainViewMode === ViewMode.BOOKMARKS && (
                <Suspense fallback={<LoadingFallback />}>
                  <Bookmarks
                    knownUsers={app.knownUsers}
                    onVote={app.handleVote}
                    onComment={app.handleComment}
                    onEditComment={app.handleEditComment}
                    onDeleteComment={app.handleDeleteComment}
                    onCommentVote={app.handleCommentVote}
                    onToggleBookmark={app.handleToggleBookmark}
                    onDeletePost={app.handleDeletePost}
                  />
                </Suspense>
              )}
              {mainViewMode === ViewMode.EDIT_POST &&
                app.editingPostId &&
                app.postsById.get(app.editingPostId) && (
                  <Suspense fallback={<LoadingFallback />}>
                    <EditPost
                      post={app.postsById.get(app.editingPostId)!}
                      boards={[...app.boards, ...app.locationBoards]}
                      onSave={app.handleSavePost}
                      onDelete={app.handleDeletePost}
                      onCancel={() => app.setViewMode(ViewMode.FEED)}
                    />
                  </Suspense>
                )}
              {mainViewMode === ViewMode.PRIVACY_POLICY && (
                <Suspense fallback={<LoadingFallback />}>
                  <PrivacyPolicy />
                </Suspense>
              )}
              {mainViewMode === ViewMode.TERMS_OF_SERVICE && (
                <Suspense fallback={<LoadingFallback />}>
                  <TermsOfService />
                </Suspense>
              )}
              {mainViewMode === ViewMode.ABOUT && (
                <Suspense fallback={<LoadingFallback />}>
                  <About />
                </Suspense>
              )}
              {mainViewMode === ViewMode.SETTINGS && (
                <Suspense fallback={<LoadingFallback />}>
                  <Settings />
                </Suspense>
              )}
            </main>
          </div>

          <footer
            className={`hidden border-t border-terminal-text/45 text-center text-terminal-dim text-xs pt-8 pb-10 md:block ${
              mainViewMode === ViewMode.FEED ? 'md:mt-44' : 'md:mt-10'
            }`}
          >
            {showFeedEndIntegrated && (
              <div className="mb-6 flex justify-center">
                <FeedEndMarker />
              </div>
            )}
            <div className="mb-2">
              BitBoard NOSTR PROTOCOL V3.0 // RELAYS: {nostrService.getRelays().length} // NODES
              ACTIVE: {(app.boards?.length ?? 0) + (app.locationBoards?.length ?? 0)}
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => app.setViewMode(ViewMode.ABOUT)}
                className="group flex items-center gap-1.5 hover:text-terminal-text transition-colors underline"
              >
                <span
                  className="inline-block w-[26px] h-[26px] shrink-0 bg-terminal-dim group-hover:bg-terminal-text transition-colors"
                  style={{
                    maskImage: "url('/assets/bitboard-logo.png')",
                    WebkitMaskImage: "url('/assets/bitboard-logo.png')",
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                  }}
                />
                About
              </button>
              <span>•</span>
              <button
                onClick={() => app.setViewMode(ViewMode.PRIVACY_POLICY)}
                className="hover:text-terminal-text transition-colors underline"
              >
                Privacy Policy
              </button>
              <span>•</span>
              <button
                onClick={() => app.setViewMode(ViewMode.TERMS_OF_SERVICE)}
                className="hover:text-terminal-text transition-colors underline"
              >
                Terms of Service
              </button>
            </div>
          </footer>
        </div>

        <FeedNewBitFab
          visible={mainViewMode === ViewMode.FEED && !showCreatePostModal}
          onNewBit={() => app.setViewMode(ViewMode.CREATE)}
        />

        {app.seedIdentityPromptPost && (
          <SeedIdentityRequiredModal
            post={app.seedIdentityPromptPost}
            onClose={app.closeSeedIdentityPrompt}
            onCreateIdentity={() => {
              setIdentityEntryIntent('generate');
              app.closeSeedIdentityPrompt();
              app.setViewMode(ViewMode.IDENTITY);
            }}
            onImportIdentity={() => {
              setIdentityEntryIntent('import');
              app.closeSeedIdentityPrompt();
              app.setViewMode(ViewMode.IDENTITY);
            }}
          />
        )}

        {app.seedSourcePost && (
          <SeedToBitBoardModal
            post={app.seedSourcePost}
            boards={app.seedableBoards}
            remainingSeeds={app.remainingSeeds}
            onClose={app.closeSeedModal}
            onSubmit={app.handleConfirmSeedPost}
          />
        )}

        <AppModal
          isOpen={showCreatePostModal}
          onClose={() => app.setViewMode(lastNonComposeViewMode)}
          className="items-center justify-center px-4 py-5 sm:py-8"
          frameClassName="w-full max-w-3xl"
          contentClassName="ui-modal-pop w-full max-h-[calc(100dvh-2rem)] overflow-auto hide-scrollbar"
        >
          <Suspense fallback={<LoadingFallback />}>
            <CreatePost
              availableBoards={[
                ...app.boards.filter((b) => b.isPublic && !b.isReadOnly),
                ...app.locationBoards,
              ]}
              currentBoardId={app.activeBoardId}
              onSubmit={app.handleCreatePost}
              onCancel={() => app.setViewMode(lastNonComposeViewMode)}
              activeUser={app.userState.username}
              userPubkey={app.userState.identity?.pubkey}
            />
          </Suspense>
        </AppModal>

        {/* Mobile Bottom Navigation */}
        <MobileNav />
      </div>
    </>
  );
};

// Main App component with context provider
const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
