import React, { useState, useEffect, lazy, Suspense } from 'react';
import { ToastHost } from './components/ToastHost';
import { SEOHead } from './components/SEOHead';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { OnboardingFlow } from './components/OnboardingFlow';
import { OfflineBanner } from './components/OfflineBanner';
import { ConsentBanner } from './components/ConsentBanner';
import { AppProvider, useApp } from './features/layout/AppContext';
import { AppHeader } from './features/layout/AppHeader';
import { Sidebar } from './features/layout/Sidebar';
import { MobileNav } from './features/layout/MobileNav';
import { MobileDrawer } from './features/layout/MobileDrawer';
import { MemoizedFeedView as FeedView } from './features/feed/FeedView';
import { NotificationCenterV2 } from './components/NotificationCenterV2';
import { PostItem } from './components/PostItem';
import { ArrowLeft } from 'lucide-react';
import { ViewMode, BoardType } from './types';
import { nostrService } from './services/nostrService';
import { keyboardShortcutsService } from './services/keyboardShortcutsService';
import { analyticsService, AnalyticsEvents } from './services/analyticsService';
import { sentryService } from './services/sentryService';
import type { Notification } from './services/notificationServiceV2';
import { identityService } from './services/identityService';
import { useUIStore } from './stores/uiStore';
import { useUserStore } from './stores/userStore';

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
const PrivacyPolicy = lazy(() =>
  import('./components/PrivacyPolicy').then((module) => ({ default: module.PrivacyPolicy })),
);
const TermsOfService = lazy(() =>
  import('./components/TermsOfService').then((module) => ({ default: module.TermsOfService })),
);
const DirectMessages = lazy(() =>
  import('./components/DirectMessages').then((module) => ({ default: module.DirectMessages })),
);
// AdvancedSearchView is available for future use when advanced search UI is implemented
const _AdvancedSearchView = lazy(() =>
  import('./components/AdvancedSearch').then((module) => ({ default: module.AdvancedSearch })),
);

import { PostSkeleton } from './components/PostSkeleton';
import {
  UserProfileSkeleton as _UserProfileSkeleton,
  BoardListSkeleton as _BoardListSkeleton,
  NotificationListSkeleton as _NotificationListSkeleton,
  DMConversationSkeleton as _DMConversationSkeleton,
  PageSkeleton as _PageSkeleton,
} from './components/LoadingSkeletons';

// Default loading fallback
const LoadingFallback = () => (
  <div className="flex items-center justify-center py-8">
    <div className="motion-safe:animate-pulse text-terminal-muted uppercase tracking-wider">
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
  onPassphraseChange: (value: string) => void;
  onConfirmPassphraseChange: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
}) => (
  <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-4">
    <div className="w-full max-w-md border-2 border-terminal-text bg-terminal-bg p-6 shadow-hard-lg">
      <h2 className="text-lg font-terminal uppercase tracking-widest text-terminal-text">
        {props.isMigration ? 'Secure Your Identity' : 'Unlock Identity'}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-terminal-muted">
        {props.isMigration
          ? 'BitBoard no longer stores the unlock key in localStorage. Set a passphrase to re-encrypt your existing identity securely.'
          : 'Enter your identity passphrase to decrypt your stored keypair on this device.'}
      </p>

      <div className="mt-4 space-y-3">
        <input
          type="password"
          value={props.passphrase}
          onChange={(e) => props.onPassphraseChange(e.target.value)}
          className="w-full border border-terminal-dim bg-terminal-bg p-3 text-terminal-text focus:border-terminal-text focus:outline-none"
          placeholder={props.isMigration ? 'Create a passphrase' : 'Enter passphrase'}
        />

        {props.isMigration && (
          <input
            type="password"
            value={props.confirmPassphrase}
            onChange={(e) => props.onConfirmPassphraseChange(e.target.value)}
            className="w-full border border-terminal-dim bg-terminal-bg p-3 text-terminal-text focus:border-terminal-text focus:outline-none"
            placeholder="Repeat passphrase"
          />
        )}

        <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-3 text-xs leading-relaxed text-terminal-muted">
          If you forget this passphrase, BitBoard cannot recover your locally stored private key.
        </div>

        {props.error && (
          <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-3 text-sm text-terminal-alert">
            {props.error}
          </div>
        )}

        <button
          type="button"
          onClick={props.onSubmit}
          disabled={props.isSubmitting}
          className="w-full border border-terminal-text bg-terminal-text px-4 py-3 font-bold uppercase tracking-wide text-black transition-colors hover:bg-terminal-dim hover:text-terminal-bg disabled:opacity-60"
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
          className="w-full border border-terminal-dim px-4 py-3 text-xs uppercase tracking-wide text-terminal-dim transition-colors hover:border-terminal-alert hover:text-terminal-alert disabled:opacity-60"
        >
          Reset Local Identity
        </button>
      </div>
    </div>
  </div>
);

// Main App component that uses context
const AppContent: React.FC = () => {
  const app = useApp();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showIdentityUnlock, setShowIdentityUnlock] = useState(false);
  const [identityUnlockMode, setIdentityUnlockMode] = useState<'unlock' | 'migrate'>('unlock');
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [unlockPassphraseConfirm, setUnlockPassphraseConfirm] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlockingIdentity, setIsUnlockingIdentity] = useState(false);
  const [notificationDmTargetPubkey, setNotificationDmTargetPubkey] = useState<
    string | undefined
  >();
  const keyboardModalStateRef = React.useRef({ showKeyboardHelp: false, showOnboarding: false });
  const navigateToBoard = app.navigateToBoard;

  useEffect(() => {
    keyboardModalStateRef.current = { showKeyboardHelp, showOnboarding };
  }, [showKeyboardHelp, showOnboarding]);

  useEffect(() => {
    let cancelled = false;

    identityService.getIdentityAsync().then(() => {
      if (cancelled) return;
      if (identityService.needsMigration()) {
        setIdentityUnlockMode('migrate');
        setShowIdentityUnlock(true);
      } else if (identityService.needsPassphrase()) {
        setIdentityUnlockMode('unlock');
        setShowIdentityUnlock(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
        app.handleIdentityChange(unlockedIdentity);
      }

      setUnlockPassphrase('');
      setUnlockPassphraseConfirm('');
      setShowIdentityUnlock(false);
    } finally {
      setIsUnlockingIdentity(false);
    }
  };

  const handleResetLockedIdentity = () => {
    identityService.clearIdentity();
    app.handleIdentityChange(null);
    setUnlockPassphrase('');
    setUnlockPassphraseConfirm('');
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
      const userId = app.userState.identity.pubkey;
      const username = app.userState.username || 'Anonymous';

      // Set user context in monitoring
      sentryService.setUser({
        id: userId,
        username: username,
        pubkey: userId,
      });

      analyticsService.identify(userId, {
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
    if (app.viewMode !== ViewMode.DIRECT_MESSAGES) {
      setNotificationDmTargetPubkey(undefined);
    }
  }, [app.viewMode]);

  const handleNotificationNavigate = (deepLink: Notification['deepLink']) => {
    if (!deepLink?.viewMode) return;

    if (deepLink.viewMode === ViewMode.SINGLE_BIT && deepLink.postId) {
      if (deepLink.boardId) {
        app.setActiveBoardId(deepLink.boardId);
      }
      app.setSelectedBitId(deepLink.postId);
      app.setViewMode(ViewMode.SINGLE_BIT);
      return;
    }

    if (deepLink.viewMode === ViewMode.USER_PROFILE && deepLink.pubkey) {
      const fallbackUsername = `${deepLink.pubkey.slice(0, 8)}...`;
      app.setProfileUser({ username: fallbackUsername, pubkey: deepLink.pubkey });
      app.setViewMode(ViewMode.USER_PROFILE);
      return;
    }

    if (deepLink.viewMode === ViewMode.DIRECT_MESSAGES) {
      setNotificationDmTargetPubkey(deepLink.pubkey);
      app.setViewMode(ViewMode.DIRECT_MESSAGES);
      return;
    }

    if (Object.values(ViewMode).includes(deepLink.viewMode as ViewMode)) {
      app.setViewMode(deepLink.viewMode as ViewMode);
    }
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
          onPassphraseChange={setUnlockPassphrase}
          onConfirmPassphraseChange={setUnlockPassphraseConfirm}
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
        onIdentityChange={app.handleIdentityChange}
      />

      <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono selection:bg-terminal-text selection:text-black relative overflow-x-hidden">
        <ToastHost />
        {/* Offline Status Banner */}
        <OfflineBanner />
        {/* Privacy Consent Banner */}
        <ConsentBanner />
        {/* Scanline Overlay */}
        <div className="scanlines fixed inset-0 pointer-events-none z-40"></div>

        {/* Mobile Drawer */}
        <MobileDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          viewMode={app.viewMode}
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
            geohashBoards={app.geohashBoards ?? []}
            boardsById={app.boardsById ?? new Map()}
            decryptionFailedBoardIds={app.decryptionFailedBoardIds}
            removeFailedDecryptionKey={app.removeFailedDecryptionKey}
            navigateToBoard={app.navigateToBoard}
            onSetViewMode={app.setViewMode}
            inMobileDrawer={true}
          />
        </MobileDrawer>

        <div className="max-w-[1174px] mx-auto p-3 md:p-6 relative z-10 pb-20 md:pb-6">
          <AppHeader onOpenDrawer={() => setIsDrawerOpen(true)} />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-8 py-[5px]">
            {/* Main Content */}
            <main className="md:col-span-3">
              {/* Feed View */}
              {app.viewMode === ViewMode.FEED && (
                <FeedView
                  sortedPosts={app.sortedPosts}
                  getBoardName={app.getBoardName}
                  knownUsers={app.knownUsers}
                  loaderRef={app.loaderRef}
                  isLoadingMore={app.isLoadingMore}
                  isInitialLoading={app.isInitialLoading}
                  onVote={app.handleVote}
                  onComment={app.handleComment}
                  onEditComment={app.handleEditComment}
                  onDeleteComment={app.handleDeleteComment}
                  onCommentVote={app.handleCommentVote}
                  onDeletePost={app.handleDeletePost}
                  onToggleBookmark={app.handleToggleBookmark}
                  onToggleMute={app.toggleMute}
                  isMuted={app.isMuted}
                  onRetryPost={app.handleRetryPost}
                />
              )}

              {/* Single Post View */}
              {app.viewMode === ViewMode.SINGLE_BIT && (
                <div className="animate-fade-in">
                  <button
                    onClick={app.returnToFeed}
                    className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-xs md:text-sm font-bold group"
                  >
                    <ArrowLeft
                      size={16}
                      className="group-hover:-translate-x-1 transition-transform"
                    />
                    BACK TO{' '}
                    {app.activeBoard
                      ? app.activeBoard.type === BoardType.GEOHASH
                        ? `#${app.activeBoard.geohash}`
                        : `//${app.activeBoard.name}`
                      : 'GLOBAL'}
                  </button>

                  <div className="border-t border-terminal-dim/30 pt-2">
                    {app.selectedPost ? (
                      <PostItem
                        post={app.selectedPost}
                        boardName={app.getBoardName(app.selectedPost.id)}
                        userState={app.userState}
                        knownUsers={app.knownUsers}
                        onVote={app.handleVote}
                        onComment={app.handleComment}
                        onEditComment={app.handleEditComment}
                        onDeleteComment={app.handleDeleteComment}
                        onCommentVote={app.handleCommentVote}
                        onViewBit={() => {}}
                        onViewProfile={app.handleViewProfile}
                        onEditPost={app.handleEditPost}
                        onTagClick={app.handleTagClick}
                        onToggleBookmark={app.handleToggleBookmark}
                        isFullPage={true}
                        onToggleMute={app.toggleMute}
                        isMuted={app.isMuted}
                        onRetryPost={app.handleRetryPost}
                      />
                    ) : (
                      <PostSkeleton />
                    )}
                  </div>
                </div>
              )}

              {/* Notifications View */}
              {app.viewMode === ViewMode.NOTIFICATIONS && (
                <div className="animate-fade-in">
                  <NotificationCenterV2
                    onClose={() => app.setViewMode(ViewMode.FEED)}
                    onNavigate={handleNotificationNavigate}
                  />
                </div>
              )}

              {/* Other views would be implemented here */}
              {app.viewMode === ViewMode.CREATE && (
                <Suspense fallback={<LoadingFallback />}>
                  <CreatePost
                    availableBoards={[
                      ...app.boards.filter((b) => b.isPublic),
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
              {app.viewMode === ViewMode.CREATE_BOARD && (
                <Suspense fallback={<LoadingFallback />}>
                  <CreateBoard
                    onSubmit={app.handleCreateBoard}
                    onCancel={() => app.setViewMode(ViewMode.FEED)}
                    identity={app.userState.identity || undefined}
                    onConnectIdentity={() => app.setViewMode(ViewMode.IDENTITY)}
                  />
                </Suspense>
              )}
              {app.viewMode === ViewMode.BROWSE_BOARDS && (
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
              {app.viewMode === ViewMode.IDENTITY && (
                <Suspense fallback={<LoadingFallback />}>
                  <IdentityManager
                    onIdentityChange={app.handleIdentityChange}
                    onClose={() => app.setViewMode(ViewMode.FEED)}
                    onViewProfile={app.handleViewProfile}
                  />
                </Suspense>
              )}
              {app.viewMode === ViewMode.RELAYS && (
                <Suspense fallback={<LoadingFallback />}>
                  <RelaySettings onClose={() => app.setViewMode(ViewMode.FEED)} />
                </Suspense>
              )}
              {app.viewMode === ViewMode.LOCATION && (
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
              {app.viewMode === ViewMode.USER_PROFILE && app.profileUser && (
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
              {app.viewMode === ViewMode.BOOKMARKS && (
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
              {app.viewMode === ViewMode.EDIT_POST &&
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
              {app.viewMode === ViewMode.PRIVACY_POLICY && (
                <Suspense fallback={<LoadingFallback />}>
                  <PrivacyPolicy />
                </Suspense>
              )}
              {app.viewMode === ViewMode.TERMS_OF_SERVICE && (
                <Suspense fallback={<LoadingFallback />}>
                  <TermsOfService />
                </Suspense>
              )}
              {/* Direct Messages View */}
              {app.viewMode === ViewMode.DIRECT_MESSAGES && app.userState.identity?.pubkey && (
                <Suspense fallback={<LoadingFallback />}>
                  <DirectMessages
                    userPubkey={app.userState.identity.pubkey}
                    initialConversationPubkey={notificationDmTargetPubkey}
                    onClose={() => app.setViewMode(ViewMode.FEED)}
                  />
                </Suspense>
              )}
            </main>

            {/* Sidebar - desktop only, mobile content lives in drawer */}
            <aside className="hidden md:block md:order-2">
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
                geohashBoards={app.geohashBoards ?? []}
                boardsById={app.boardsById ?? new Map()}
                decryptionFailedBoardIds={app.decryptionFailedBoardIds}
                removeFailedDecryptionKey={app.removeFailedDecryptionKey}
                navigateToBoard={app.navigateToBoard}
                onSetViewMode={app.setViewMode}
              />
            </aside>
          </div>
        </div>

        {/* Footer - hidden on mobile to make room for bottom nav */}
        <footer className="hidden md:block text-center text-terminal-muted text-xs py-8">
          <div className="mb-2">
            BitBoard NOSTR PROTOCOL V3.0 // RELAYS: {nostrService.getRelays().length} // NODES
            ACTIVE: {(app.boards?.length ?? 0) + (app.locationBoards?.length ?? 0)}
          </div>
          <div className="space-x-4">
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
