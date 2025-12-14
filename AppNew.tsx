import React from 'react';
import { ToastHost } from './components/ToastHost';
import { AppProvider, useApp } from './features/layout/AppContext';
import { AppHeader } from './features/layout/AppHeader';
import { Sidebar } from './features/layout/Sidebar';
import { FeedView } from './features/feed/FeedView';
import { ArrowLeft } from 'lucide-react';
import { ViewMode, BoardType } from './types';

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
                onViewBit={app.handleViewBit}
                onViewProfile={app.handleViewProfile}
                onEditPost={app.handleEditPost}
                onTagClick={app.handleTagClick}
                bookmarkedIdSet={app.bookmarkedIdSet}
                reportedPostIdSet={app.reportedPostIdSet}
                onToggleBookmark={(id) => {
                  // Would need bookmarkService.toggleBookmark(id)
                  console.log('Toggle bookmark:', id);
                }}
                isNostrConnected={app.isNostrConnected}
                loaderRef={app.loaderRef}
                isLoadingMore={app.isLoadingMore}
                hasMorePosts={app.hasMorePosts}
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
                  {/* PostItem component would go here */}
                  <div>Single post view - PostItem component needed</div>
                </div>
              </div>
            )}

            {/* Other views would be implemented here */}
            {app.viewMode === ViewMode.CREATE && <div>Create Post View</div>}
            {app.viewMode === ViewMode.CREATE_BOARD && <div>Create Board View</div>}
            {app.viewMode === ViewMode.IDENTITY && <div>Identity Manager View</div>}
            {app.viewMode === ViewMode.RELAYS && <div>Relay Settings View</div>}
            {app.viewMode === ViewMode.LOCATION && <div>Location Selector View</div>}
            {app.viewMode === ViewMode.USER_PROFILE && <div>User Profile View</div>}
            {app.viewMode === ViewMode.BOOKMARKS && <div>Bookmarks View</div>}
            {app.viewMode === ViewMode.EDIT_POST && <div>Edit Post View</div>}
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
        BitBoard NOSTR PROTOCOL V3.0 // RELAYS: {0} // NODES ACTIVE: {app.boards.length + app.locationBoards.length}
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
