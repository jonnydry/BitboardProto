import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uiState: {
    viewMode: 'FEED',
    searchQuery: '',
    sortMode: 'top',
    feedFilter: 'all',
    hasMorePosts: true,
    setSortMode: vi.fn(),
    setSearchQuery: vi.fn(),
    setViewMode: vi.fn(),
  },
  activeBoard: null as any,
  navigation: {
    handleViewBit: vi.fn(),
    handleViewProfile: vi.fn(),
    handleEditPost: vi.fn(),
    handleTagClick: vi.fn(),
  },
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: any) => selector(mocks.uiState),
  useViewMode: () => mocks.uiState.viewMode,
  useSearchQuery: () => mocks.uiState.searchQuery,
  useSortMode: () => mocks.uiState.sortMode,
  useFeedFilter: () => mocks.uiState.feedFilter,
  useHasMorePosts: () => mocks.uiState.hasMorePosts,
}));

vi.mock('../../stores/boardStore', () => ({
  useActiveBoard: () => mocks.activeBoard,
}));

vi.mock('../../features/layout/useAppNavigationHandlers', () => ({
  useAppNavigationHandlers: () => mocks.navigation,
}));

vi.mock('../../components/SearchBar', () => ({
  SearchBar: ({ onSearch }: { onSearch: (q: string) => void }) => (
    <button onClick={() => onSearch('query-from-search')}>Trigger Search</button>
  ),
}));

vi.mock('../../components/SortSelector', () => ({
  SortSelector: ({ onSortChange }: { onSortChange: (s: string) => void }) => (
    <button onClick={() => onSortChange('newest')}>Sort Newest</button>
  ),
}));

vi.mock('../../components/PostSkeleton', () => ({
  PostSkeleton: () => <div>PostSkeleton</div>,
}));

vi.mock('../../components/LoadingSkeletons', () => ({
  LoadingPhaseIndicator: () => <div>LoadingPhaseIndicator</div>,
}));

vi.mock('../../components/ShareBoardLink', () => ({
  ShareBoardLink: ({ onClose }: { onClose: () => void }) => (
    <div>
      <span>ShareBoardLink</span>
      <button onClick={onClose}>Close Share</button>
    </div>
  ),
}));

vi.mock('../../services/encryptedBoardService', () => ({
  encryptedBoardService: {
    hasBoardKey: vi.fn(() => true),
  },
}));

vi.mock('../../features/feed/feedParts', () => ({
  TIME_CHUNK_LABELS: {
    today: 'Today',
    yesterday: 'Yesterday',
    this_week: 'This Week',
    this_month: 'This Month',
    earlier: 'Earlier',
  },
  TimeChunkHeader: ({ chunk, postCount }: any) => <div>{`${chunk}:${postCount}`}</div>,
  FeedPostCard: ({ post, onVote, onToggleBookmark }: any) => (
    <div>
      <span>{post.title}</span>
      <button onClick={() => onVote(post.id, 'up')}>Vote {post.id}</button>
      <button onClick={() => onToggleBookmark(post.id)}>Bookmark {post.id}</button>
    </div>
  ),
  FeedLoaderRow: ({ hasMorePosts }: any) => <div>{hasMorePosts ? 'Has more' : 'No more'}</div>,
}));

import { FeedView } from '../../features/feed/FeedView';
import { BoardType, ViewMode } from '../../types';

const baseProps = {
  sortedPosts: [] as any[],
  getBoardName: vi.fn(),
  knownUsers: new Set<string>(),
  onVote: vi.fn(),
  onComment: vi.fn(),
  onEditComment: vi.fn(),
  onDeleteComment: vi.fn(),
  onDeletePost: vi.fn(),
  onToggleBookmark: vi.fn(),
  loaderRef: { current: null },
  isLoadingMore: false,
};

describe('FeedView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('scrollTo', vi.fn());
    mocks.uiState.viewMode = 'FEED';
    mocks.uiState.searchQuery = '';
    mocks.uiState.feedFilter = 'all';
    mocks.activeBoard = null;
  });

  it('shows empty state actions for topic and default feeds', () => {
    mocks.uiState.feedFilter = 'topic';
    const { rerender } = render(<FeedView {...baseProps} />);

    fireEvent.click(screen.getByText('[ BROWSE_BOARDS ]'));
    expect(mocks.uiState.setViewMode).toHaveBeenCalledWith(ViewMode.BROWSE_BOARDS);

    mocks.uiState.feedFilter = 'all';
    rerender(<FeedView {...baseProps} />);
    fireEvent.click(screen.getByText('[ INIT_BIT ]'));
    expect(mocks.uiState.setViewMode).toHaveBeenCalledWith(ViewMode.CREATE);
  });

  it('renders board header controls and share modal for encrypted boards', () => {
    mocks.activeBoard = {
      id: 'secure-board',
      name: 'Secure Board',
      description: 'Encrypted board',
      isEncrypted: true,
      type: BoardType.TOPIC,
    };

    render(
      <FeedView
        {...baseProps}
        sortedPosts={
          [{ id: 'post-1', title: 'A Post', timestamp: Date.now(), comments: [] }] as any
        }
      />,
    );

    fireEvent.click(screen.getByText('SHARE'));
    expect(screen.getByText('ShareBoardLink')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Sort Newest'));
    fireEvent.click(screen.getByText('Trigger Search'));

    expect(mocks.uiState.setSortMode).toHaveBeenCalledWith('newest');
    expect(mocks.uiState.setSearchQuery).toHaveBeenCalledWith('query-from-search');
  });

  it('forwards post interactions to handlers', () => {
    render(
      <FeedView
        {...baseProps}
        sortedPosts={
          [{ id: 'post-1', title: 'A Post', timestamp: Date.now(), comments: [], tags: [] }] as any
        }
      />,
    );

    fireEvent.click(screen.getByText('Vote post-1'));
    fireEvent.click(screen.getByText('Bookmark post-1'));

    expect(baseProps.onVote).toHaveBeenCalledWith('post-1', 'up');
    expect(baseProps.onToggleBookmark).toHaveBeenCalledWith('post-1');
  });
});
