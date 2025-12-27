import React, { useState, lazy, Suspense } from 'react';
import { ToastHost } from './components/ToastHost';
import { AppProvider, useApp } from './features/layout/AppContext';
import { AppHeader } from './features/layout/AppHeader';
import { Sidebar } from './features/layout/Sidebar';
import { MobileNav } from './features/layout/MobileNav';
import { MobileDrawer } from './features/layout/MobileDrawer';
import { FeedView } from './features/feed/FeedView';
import { PostItem } from './components/PostItem';
import { ArrowLeft } from 'lucide-react';
import { ViewMode, BoardType } from './types';
import { nostrService } from './services/nostrService';

// Lazy load components that are only used in specific views
const IdentityManager = lazy(() => import('./components/IdentityManager').then(module => ({ default: module.IdentityManager })));
const RelaySettings = lazy(() => import('./components/RelaySettings').then(module => ({ default: module.RelaySettings })));
const CreatePost = lazy(() => import('./components/CreatePost').then(module => ({ default: module.CreatePost })));
const CreateBoard = lazy(() => import('./components/CreateBoard').then(module => ({ default: module.CreateBoard })));
const LocationSelector = lazy(() => import('./components/LocationSelector').then(module => ({ default: module.LocationSelector })));
const UserProfile = lazy(() => import('./components/UserProfile').then(module => ({ default: module.UserProfile })));
const Bookmarks = lazy(() => import('./components/Bookmarks').then(module => ({ default: module.Bookmarks })));
const EditPost = lazy(() => import('./components/EditPost').then(module => ({ default: module.EditPost })));
const BoardBrowser = lazy(() => import('./components/BoardBrowser').then(module => ({ default: module.BoardBrowser })));
const NotificationCenter = lazy(() => import('./components/NotificationCenter').then(module => ({ default: module.NotificationCenter })));

// Loading fallback for lazy components
const LoadingFallback = () => (
  <div className="flex items-center justify-center py-8">
    <div className="animate-pulse">LOADING...</div>
  </div>
);

// Main App component that uses context
const AppContent: React.FC = () => {
  const app = useApp();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono selection:bg-terminal-text selection:text-black relative overflow-x-hidden">
      <ToastHost />
      {/* Scanline Overlay */}
      <div className="scanlines fixed inset-0 pointer-events-none z-50"></div>

      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        viewMode={app.viewMode}
        onSetViewMode={app.setViewMode}
        onNavigateGlobal={() => app.navigateToBoard(null)}
        identity={app.userState.identity || undefined}
        userState={app.userState}
        bookmarkedCount={app.bookmarkedIds.length}
        isNostrConnected={app.isNostrConnected}
      />

      <div className="max-w-[1174px] mx-auto p-3 md:p-6 relative z-10 pb-20 md:pb-6">
        <AppHeader
          theme={app.theme}
          isNostrConnected={app.isNostrConnected}
          viewMode={app.viewMode}
          activeBoardId={app.activeBoardId}
          bookmarkedCount={app.bookmarkedIds.length}
          identity={app.userState.identity || undefined}
          userState={app.userState}
          onNavigateGlobal={() => app.navigateToBoard(null)}
          onSetViewMode={app.setViewMode}
          onOpenDrawer={() => setIsDrawerOpen(true)}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-8 py-[5px]">
          {/* Main Content */}
          <main className="md:col-span-3 order-2 md:order-1">
            {/* Feed View */}
            {app.viewMode === ViewMode.FEED && (
              <FeedView
                sortedPosts={app.sortedPosts}
                searchQuery={app.searchQuery}
                sortMode={app.sortMode}
                setSortMode={app.setSortMode}
                activeBoard={app.activeBoard}
                viewMode={app.viewMode}
                onSetViewMode={app.setViewMode}
                onSearch={app.handleSearch}
                getBoardName={app.getBoardName}
                userState={app.userState}
                knownUsers={app.knownUsers}
                onVote={app.handleVote}
                onComment={app.handleComment}
                onEditComment={app.handleEditComment}
                onDeleteComment={app.handleDeleteComment}
                onCommentVote={app.handleCommentVote}
                onViewBit={app.handleViewBit}
                onViewProfile={app.handleViewProfile}
                onEditPost={app.handleEditPost}
                onDeletePost={app.handleDeletePost}
                onTagClick={app.handleTagClick}
                bookmarkedIdSet={app.bookmarkedIdSet}
                reportedPostIdSet={app.reportedPostIdSet}
                onToggleBookmark={app.handleToggleBookmark}
                isNostrConnected={app.isNostrConnected}
                loaderRef={app.loaderRef}
                isLoadingMore={app.isLoadingMore}
                hasMorePosts={app.hasMorePosts}
                onToggleMute={app.toggleMute}
                isMuted={app.isMuted}
              />
            )}

            {/* Single Post View */}
            {app.viewMode === ViewMode.SINGLE_BIT && app.selectedPost && (
              <div className="animate-fade-in">
                <button
                  onClick={app.returnToFeed}
                  className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-xs md:text-sm font-bold group"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  BACK TO {app.activeBoard ? (app.activeBoard.type === BoardType.GEOHASH ? `#${app.activeBoard.geohash}` : `//${app.activeBoard.name}`) : 'GLOBAL'}
                </button>

                <div className="border-t border-terminal-dim/30 pt-2">
                  <PostItem 
                    post={app.selectedPost} 
                    boardName={app.selectedPost ? app.getBoardName(app.selectedPost.id) : undefined}
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
                    isBookmarked={app.bookmarkedIdSet.has(app.selectedPost.id)}
                    onToggleBookmark={app.handleToggleBookmark}
                    hasReported={app.reportedPostIdSet.has(app.selectedPost.id)}
                    isFullPage={true}
                    isNostrConnected={app.isNostrConnected}
                    onToggleMute={app.toggleMute}
                    isMuted={app.isMuted}
                  />
                </div>
              </div>
            )}

            {/* Notifications View */}
            {app.viewMode === ViewMode.NOTIFICATIONS && (
              <div className="animate-fade-in">
                <Suspense fallback={<LoadingFallback />}>
                  <NotificationCenter onClose={() => app.setViewMode(ViewMode.FEED)} />
                </Suspense>
              </div>
            )}

            {/* Other views would be implemented here */}
            {app.viewMode === ViewMode.CREATE && (
              <Suspense fallback={<LoadingFallback />}>
                <CreatePost
                  availableBoards={[...app.boards.filter(b => b.isPublic), ...app.locationBoards]}
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
                  topicBoards={app.topicBoards}
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
                />
              </Suspense>
            )}
            {app.viewMode === ViewMode.RELAYS && (
              <Suspense fallback={<LoadingFallback />}>
                <RelaySettings
                  onClose={() => app.setViewMode(ViewMode.FEED)}
                />
              </Suspense>
            )}
            {app.viewMode === ViewMode.LOCATION && (
              <Suspense fallback={<LoadingFallback />}>
                <LocationSelector
                  onSelectBoard={(board) => {
                    // Add board to location boards if not already present
                    app.setLocationBoards((prev) => {
                      if (prev.some(b => b.id === board.id)) return prev;
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
                  username={app.profileUser.username}
                  authorPubkey={app.profileUser.pubkey}
                  posts={app.posts}
                  bookmarkedIdSet={app.bookmarkedIdSet}
                  reportedPostIdSet={app.reportedPostIdSet}
                  onToggleBookmark={app.handleToggleBookmark}
                  userState={app.userState}
                  knownUsers={app.knownUsers}
                  onVote={app.handleVote}
                  onComment={app.handleComment}
                  onEditComment={app.handleEditComment}
                  onDeleteComment={app.handleDeleteComment}
                  onCommentVote={app.handleCommentVote}
                  onViewBit={app.handleViewBit}
                  onViewProfile={app.handleViewProfile}
                  onEditPost={app.handleEditPost}
                  onDeletePost={app.handleDeletePost}
                  onTagClick={app.handleTagClick}
                  onRefreshProfile={(pubkey) => app.refreshProfileMetadata([pubkey])}
                  onClose={() => app.setViewMode(ViewMode.FEED)}
                  isNostrConnected={app.isNostrConnected}
                  onToggleMute={app.toggleMute}
                  isMuted={app.isMuted}
                />
              </Suspense>
            )}
            {app.viewMode === ViewMode.BOOKMARKS && (
              <Suspense fallback={<LoadingFallback />}>
                <Bookmarks
                  posts={app.posts}
                  bookmarkedIds={app.bookmarkedIds}
                  reportedPostIdSet={app.reportedPostIdSet}
                  userState={app.userState}
                  knownUsers={app.knownUsers}
                  onVote={app.handleVote}
                  onComment={app.handleComment}
                  onEditComment={app.handleEditComment}
                  onDeleteComment={app.handleDeleteComment}
                  onCommentVote={app.handleCommentVote}
                  onViewBit={app.handleViewBit}
                  onViewProfile={app.handleViewProfile}
                  onEditPost={app.handleEditPost}
                  onDeletePost={app.handleDeletePost}
                  onTagClick={app.handleTagClick}
                  onClose={() => app.setViewMode(ViewMode.FEED)}
                  isNostrConnected={app.isNostrConnected}
                  onToggleMute={app.toggleMute}
                  isMuted={app.isMuted}
                />
              </Suspense>
            )}
            {app.viewMode === ViewMode.EDIT_POST && app.editingPostId && app.postsById.get(app.editingPostId) && (
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
          </main>

          {/* Sidebar - shows above content on mobile, beside on desktop */}
          <aside className="order-1 md:order-2">
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
              topicBoards={app.topicBoards}
              geohashBoards={app.geohashBoards}
              navigateToBoard={app.navigateToBoard}
              onSetViewMode={app.setViewMode}
            />
          </aside>
        </div>
      </div>
      
      {/* Footer - hidden on mobile to make room for bottom nav */}
      <footer className="hidden md:block text-center text-terminal-dim text-xs py-8 opacity-50">
        BitBoard NOSTR PROTOCOL V3.0 // RELAYS: {nostrService.getRelays().length} // NODES ACTIVE: {app.boards.length + app.locationBoards.length}
      </footer>

      {/* Mobile Bottom Navigation */}
      <MobileNav
        viewMode={app.viewMode}
        onSetViewMode={app.setViewMode}
        onNavigateGlobal={() => app.navigateToBoard(null)}
        identity={app.userState.identity || undefined}
        bookmarkedCount={app.bookmarkedIds.length}
      />
    </div>
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
