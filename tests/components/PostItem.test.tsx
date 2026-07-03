import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostItem } from '../../components/PostItem';
import { Post } from '../../types';

// Mock heavy sub-deps to isolate smoke for verification block + vote (bits/geo identity)
vi.mock('../../components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));
vi.mock('../../components/ReactionPicker', () => ({
  ReactionBar: () => <div data-testid="reactions" />,
}));
vi.mock('../../components/ZapButton', () => ({
  ZapButton: () => <div data-testid="zap" />,
}));
vi.mock('../../components/BadgeDisplay', () => ({
  BadgeDisplay: () => <div data-testid="badge" />,
}));
vi.mock('../../components/TrustIndicator', () => ({
  TrustIndicator: () => <div data-testid="trust" />,
}));
vi.mock('../../components/ShareButton', () => ({
  ShareButton: () => <div data-testid="share" />,
}));
vi.mock('../../components/usePostAuthorProfile', () => ({
  usePostAuthorProfile: () => ({
    postRef: { current: null },
    authorProfile: null,
    profileLoadState: 'loaded',
  }),
}));
vi.mock('../../services/profileService', () => ({
  profileService: {
    getDisplayName: (a: string) => a || 'anon',
    getCachedProfileSync: () => null,
  },
}));
vi.mock('../../services/toastService', () => ({
  toastService: { push: vi.fn() },
}));
vi.mock('../../stores/userStore', () => ({
  useUserState: () => ({ identity: { pubkey: 'pk1' }, bits: 42, maxBits: 100, votedPosts: {} }),
  useIsMuted: () => false,
}));
vi.mock('../../stores/uiStore', () => ({
  useUIStore: (sel: any) => sel({ isNostrConnected: true, bookmarkedIds: [], reportedPostIds: [] }),
}));
vi.mock('lucide-react', () => ({
  Shield: () => <span data-testid="shield" />,
  Users: () => <span data-testid="users" />,
  MessageSquare: () => <span />,
  Bookmark: () => <span />,
  Edit3: () => <span />,
  Flag: () => <span />,
  Lock: () => <span />,
  VolumeX: () => <span />,
  Trash2: () => <span />,
  Loader2: () => <span />,
  RefreshCw: () => <span />,
  AlertTriangle: () => <span />,
  MoreHorizontal: () => <span />,
  Radio: () => <span />,
  Link: () => <span data-testid="link-icon" />,
  Share2: () => <span data-testid="share2-icon" />,
}));

const basePost: Post = {
  id: 'p1',
  boardId: 'b-tech',
  title: 'Test post with bits',
  author: 'tester',
  authorPubkey: 'pk1',
  content: 'Hello verified sigs and geo.',
  timestamp: Date.now() - 3600_000,
  score: 7,
  commentCount: 2,
  tags: [],
  comments: [],
  upvotes: 8,
  downvotes: 1,
  nostrEventId: 'evt1',
  votesVerified: true,
  uniqueVoters: 5,
  isEncrypted: false,
};

const baseProps = {
  post: basePost,
  onVote: vi.fn(),
  onComment: vi.fn(),
  onViewBit: vi.fn(),
  onViewProfile: vi.fn(),
  onToggleBookmark: vi.fn(),
};

describe('PostItem (smoke for voting/geo identity surfacing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders feed card with score, verified sigs block, and uniqueVoters emphasis', () => {
    render(<PostItem {...baseProps} />);
    expect(screen.getByText(/7/)).toBeTruthy(); // score
    // From enhanced verification: "verified sigs"
    expect(screen.getAllByText(/verified sigs/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/5 verified sigs/i)).toBeTruthy();
    // Tooltip titles mention bits + crypto
    const sigEl = screen.getByTitle(/bits economy \+ cryptographic sigs/i);
    expect(sigEl).toBeTruthy();
  });

  it('shows vote column and verified elements (bit locked conditional covered by integration; hasInvested via userStore)', () => {
    render(<PostItem {...baseProps} />);
    // Smoke the score + verified surfacing; "bit locked" text appears in cards when voted (see PostItem + e2e/voting)
    expect(screen.getAllByText(/verified sigs/i).length).toBeGreaterThan(0);
  });

  it('exposes vote buttons (titles mention spend/refund per postItemUtils)', () => {
    render(<PostItem {...baseProps} />);
    // Buttons have aria + title from getPostVoteTitle: spend 1 bit...
    const ups = screen.getAllByRole('button', { name: /upvote/i });
    expect(ups.length).toBeGreaterThan(0);
  });
});
