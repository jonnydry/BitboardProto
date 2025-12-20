import React from 'react';
import { ToastHost } from './components/ToastHost';
import { AppProvider, useApp } from './features/layout/AppContext';
import { AppHeader } from './features/layout/AppHeader';
import { Sidebar } from './features/layout/Sidebar';
import { FeedView } from './features/feed/FeedView';
import { IdentityManager } from './components/IdentityManager';
import { RelaySettings } from './components/RelaySettings';
import { CreatePost } from './components/CreatePost';
import { CreateBoard } from './components/CreateBoard';
import { LocationSelector } from './components/LocationSelector';
import { UserProfile } from './components/UserProfile';
import { Bookmarks } from './components/Bookmarks';
import { EditPost } from './components/EditPost';
import { PostItem } from './components/PostItem';
import { ArrowLeft } from 'lucide-react';
import { ViewMode, BoardType } from './types';
import { nostrService } from './services/nostrService';

// Main App component that uses context
const AppContent: React.FC = () => {
  const app = useApp();

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono selection:bg-terminal-text selection:text-black relative">
      <ToastHost />
      {/* Scanline Overlay */}
      <div className="scanlines fixed inset-0 pointer-events-none z-50"></div>

      <div className="max-w-[1074px] mx-auto p-4 md:p-6 relative z-10">
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
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 py-[5px]">
          {/* Main Content */}
          <main className="md:col-span-3">
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
                  className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-sm font-bold group"
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

            {/* Other views would be implemented here */}
            {app.viewMode === ViewMode.CREATE && (
              <CreatePost
                availableBoards={[...app.boards.filter(b => b.isPublic), ...app.locationBoards]}
                currentBoardId={app.activeBoardId}
                onSubmit={app.handleCreatePost}
                onCancel={() => app.setViewMode(ViewMode.FEED)}
                activeUser={app.userState.username}
                userPubkey={app.userState.identity?.pubkey}
              />
            )}
            {app.viewMode === ViewMode.CREATE_BOARD && (
              <CreateBoard
                onSubmit={app.handleCreateBoard}
                onCancel={() => app.setViewMode(ViewMode.FEED)}
                identity={app.userState.identity || undefined}
                onConnectIdentity={() => app.setViewMode(ViewMode.IDENTITY)}
              />
            )}
            {app.viewMode === ViewMode.IDENTITY && (
              <IdentityManager
                onIdentityChange={app.handleIdentityChange}
                onClose={() => app.setViewMode(ViewMode.FEED)}
              />
            )}
            {app.viewMode === ViewMode.RELAYS && (
              <RelaySettings
                onClose={() => app.setViewMode(ViewMode.FEED)}
              />
            )}
            {app.viewMode === ViewMode.LOCATION && (
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
            )}
            {app.viewMode === ViewMode.USER_PROFILE && app.profileUser && (
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
                onTagClick={app.handleTagClick}
                onRefreshProfile={(pubkey) => app.refreshProfileMetadata([pubkey])}
                onClose={() => app.setViewMode(ViewMode.FEED)}
                isNostrConnected={app.isNostrConnected}
                onToggleMute={app.toggleMute}
                isMuted={app.isMuted}
              />
            )}
            {app.viewMode === ViewMode.BOOKMARKS && (
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
                onTagClick={app.handleTagClick}
                onClose={() => app.setViewMode(ViewMode.FEED)}
                isNostrConnected={app.isNostrConnected}
                onToggleMute={app.toggleMute}
                isMuted={app.isMuted}
              />
            )}
            {app.viewMode === ViewMode.EDIT_POST && app.editingPostId && app.postsById.get(app.editingPostId) && (
              <EditPost
                post={app.postsById.get(app.editingPostId)!}
                boards={[...app.boards, ...app.locationBoards]}
                onSave={app.handleSavePost}
                onDelete={app.handleDeletePost}
                onCancel={() => app.setViewMode(ViewMode.FEED)}
              />
            )}
          </main>

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
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-terminal-dim text-xs py-8 opacity-50">
        BitBoard NOSTR PROTOCOL V3.0 // RELAYS: {nostrService.getRelays().length} // NODES ACTIVE: {app.boards.length + app.locationBoards.length}
      </footer>
    </div>
  );
};

// Main App component with context provider
const AppNew: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default AppNew;
