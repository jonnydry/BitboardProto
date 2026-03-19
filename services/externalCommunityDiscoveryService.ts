import type { Board, Community, Post } from '../types';
import { communityService } from './communityService';
import { votingService } from './votingService';
import { nostrService } from './nostr/NostrService';

export type ExternalCommunityCategory =
  | 'trending'
  | 'technology'
  | 'bitcoin'
  | 'privacy'
  | 'culture'
  | 'regional'
  | 'other';

export interface DiscoveredCommunity {
  community: Community;
  board: Board;
  category: ExternalCommunityCategory;
  discoveryScore: number;
  approvalCount: number;
  recentApprovalCount: number;
  latestApprovalAt?: number;
}

interface CachedDiscoveryResult {
  timestamp: number;
  communities: DiscoveredCommunity[];
}

interface ApprovalStats {
  approvalCount: number;
  recentApprovalCount: number;
  latestApprovalAt?: number;
}

interface CachedPreviewResult {
  timestamp: number;
  posts: Post[];
}

const CATEGORY_LABELS: Record<ExternalCommunityCategory, string> = {
  trending: 'Trending',
  technology: 'Technology',
  bitcoin: 'Bitcoin',
  privacy: 'Privacy',
  culture: 'Culture',
  regional: 'Regional',
  other: 'Other',
};

const CATEGORY_KEYWORDS: Array<{
  category: Exclude<ExternalCommunityCategory, 'trending' | 'other'>;
  keywords: string[];
}> = [
  {
    category: 'bitcoin',
    keywords: ['bitcoin', 'btc', 'lightning', 'sats', 'nostr+bitcoin'],
  },
  {
    category: 'privacy',
    keywords: ['privacy', 'security', 'opsec', 'surveillance', 'cypherpunk', 'freedom'],
  },
  {
    category: 'technology',
    keywords: ['dev', 'developer', 'code', 'coding', 'tech', 'protocol', 'nostr', 'nips'],
  },
  {
    category: 'regional',
    keywords: ['local', 'city', 'region', 'meetup', 'austin', 'nyc', 'london', 'berlin'],
  },
  {
    category: 'culture',
    keywords: ['music', 'gaming', 'games', 'art', 'culture', 'design', 'film', 'sports'],
  },
];

class ExternalCommunityDiscoveryService {
  private discoveryCache: CachedDiscoveryResult | null = null;
  private previewCache = new Map<string, CachedPreviewResult>();
  private readonly CACHE_TTL_MS = 2 * 60 * 1000;
  private readonly PREVIEW_CACHE_TTL_MS = 60 * 1000;
  private readonly APPROVAL_ENRICH_LIMIT = 48;

  private classify(community: Community): ExternalCommunityCategory {
    const haystack = [
      community.id,
      community.name,
      community.description ?? '',
      community.rules ?? '',
      ...(community.relays ?? []),
      community.address ?? '',
    ]
      .join(' ')
      .toLowerCase();
    for (const entry of CATEGORY_KEYWORDS) {
      if (entry.keywords.some((keyword) => haystack.includes(keyword))) {
        return entry.category;
      }
    }
    return 'other';
  }

  private computeBaseScore(community: Community): number {
    const recencyDays = community.createdAt
      ? Math.max(0, (Date.now() - community.createdAt) / (1000 * 60 * 60 * 24))
      : 365;
    const recencyBoost = Math.max(0, 40 - recencyDays);
    const moderatorScore = community.moderators.length * 6;
    const relayScore = (community.relays?.length ?? 0) * 3;
    const richnessScore = community.description
      ? Math.min(community.description.length / 12, 18)
      : 0;
    return recencyBoost + moderatorScore + relayScore + richnessScore;
  }

  private async getApprovalStats(community: Community): Promise<ApprovalStats> {
    const communityAddress = community.address;
    if (!communityAddress) return { approvalCount: 0, recentApprovalCount: 0 };

    const approvals = await communityService.fetchApprovalsForCommunity(
      communityAddress,
      community.approvalRelays ?? community.relays,
    );
    if (approvals.length === 0) {
      return { approvalCount: 0, recentApprovalCount: 0 };
    }

    const now = Date.now();
    const recentWindowMs = 7 * 24 * 60 * 60 * 1000;
    const uniqueApprovedPosts = new Set(approvals.map((approval) => approval.postEventId));

    return {
      approvalCount: uniqueApprovedPosts.size,
      recentApprovalCount: approvals.filter(
        (approval) => now - approval.timestamp <= recentWindowMs,
      ).length,
      latestApprovalAt: approvals[0]?.timestamp,
    };
  }

  private computeDiscoveryScore(community: Community, stats: ApprovalStats): number {
    const baseScore = this.computeBaseScore(community);
    const approvalRecencyDays = stats.latestApprovalAt
      ? Math.max(0, (Date.now() - stats.latestApprovalAt) / (1000 * 60 * 60 * 24))
      : 365;
    const approvalRecencyBoost = Math.max(0, 30 - approvalRecencyDays) * 1.5;

    return (
      baseScore + stats.approvalCount * 2.5 + stats.recentApprovalCount * 8 + approvalRecencyBoost
    );
  }

  private sortPosts(posts: Post[]): Post[] {
    return [...posts].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.timestamp - a.timestamp;
    });
  }

  private async hydratePosts(posts: Post[]): Promise<Post[]> {
    if (posts.length === 0) return [];

    const tallies = await votingService.fetchVotesForPosts(
      posts.map((post) => post.nostrEventId).filter(Boolean) as string[],
    );

    const postsWithVotes = posts.map((post) => {
      const tally = post.nostrEventId ? tallies.get(post.nostrEventId) : undefined;
      if (!tally) return post;
      return {
        ...post,
        upvotes: tally.upvotes,
        downvotes: tally.downvotes,
        score: tally.score,
        uniqueVoters: tally.uniqueVoters,
        votesVerified: true,
      };
    });

    const pubkeys = Array.from(
      new Set(postsWithVotes.map((post) => post.authorPubkey).filter(Boolean) as string[]),
    );
    if (pubkeys.length > 0) {
      await nostrService.fetchProfiles(pubkeys);
    }

    return postsWithVotes.map((post) =>
      post.authorPubkey
        ? { ...post, author: nostrService.getDisplayName(post.authorPubkey) }
        : post,
    );
  }

  private upsertPreviewCache(board: Board, post: Post): void {
    const communityAddress = board.communityAddress || board.id;
    const cachedPosts = this.previewCache.get(communityAddress)?.posts ?? [];
    const merged = this.sortPosts([
      ...cachedPosts.filter((cachedPost) => cachedPost.id !== post.id),
      post,
    ]);
    this.previewCache.set(communityAddress, {
      timestamp: Date.now(),
      posts: merged,
    });
  }

  async discoverCommunities(
    opts: {
      limit?: number;
      forceRefresh?: boolean;
    } = {},
  ): Promise<DiscoveredCommunity[]> {
    if (
      !opts.forceRefresh &&
      this.discoveryCache &&
      Date.now() - this.discoveryCache.timestamp < this.CACHE_TTL_MS
    ) {
      return this.discoveryCache.communities;
    }

    const communities = await communityService.fetchCommunities({ limit: opts.limit ?? 250 });
    const validCommunities = communities.filter((community) => !!community.address);

    const preRanked = [...validCommunities].sort(
      (a, b) => this.computeBaseScore(b) - this.computeBaseScore(a) || a.name.localeCompare(b.name),
    );

    const communitiesToEnrich = preRanked.slice(0, this.APPROVAL_ENRICH_LIMIT);
    const statsEntries = await Promise.all(
      communitiesToEnrich.map(async (community) => {
        try {
          return [community.address as string, await this.getApprovalStats(community)] as const;
        } catch {
          return [
            community.address as string,
            { approvalCount: 0, recentApprovalCount: 0 },
          ] as const;
        }
      }),
    );
    const statsMap = new Map<string, ApprovalStats>(statsEntries);

    const discovered = validCommunities
      .map((community) => {
        const stats = statsMap.get(community.address as string) ?? {
          approvalCount: 0,
          recentApprovalCount: 0,
        };

        return {
          community,
          board: communityService.communityToBoard(community),
          category: this.classify(community),
          discoveryScore: this.computeDiscoveryScore(community, stats),
          approvalCount: stats.approvalCount,
          recentApprovalCount: stats.recentApprovalCount,
          latestApprovalAt: stats.latestApprovalAt,
        };
      })
      .sort(
        (a, b) =>
          b.discoveryScore - a.discoveryScore || a.community.name.localeCompare(b.community.name),
      );

    this.discoveryCache = {
      timestamp: Date.now(),
      communities: discovered,
    };

    return discovered;
  }

  getCategoryLabel(category: ExternalCommunityCategory): string {
    return CATEGORY_LABELS[category];
  }

  buildSections(discovered: DiscoveredCommunity[]): Array<{
    id: ExternalCommunityCategory;
    label: string;
    communities: DiscoveredCommunity[];
  }> {
    const categories: ExternalCommunityCategory[] = [
      'trending',
      'technology',
      'bitcoin',
      'privacy',
      'culture',
      'regional',
      'other',
    ];

    return categories
      .map((category) => {
        const communities =
          category === 'trending'
            ? discovered
            : discovered.filter((entry) => entry.category === category);
        return { id: category, label: this.getCategoryLabel(category), communities };
      })
      .filter((section) => section.communities.length > 0);
  }

  async fetchCommunityPreview(board: Board, limit = 8, forceRefresh = false): Promise<Post[]> {
    const communityAddress = board.communityAddress || board.id;
    const cached = this.previewCache.get(communityAddress);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.PREVIEW_CACHE_TTL_MS) {
      return cached.posts.slice(0, limit);
    }

    const approvedEvents = await communityService.fetchApprovedPosts(
      communityAddress,
      board.authorRelayHints ?? board.relayHints,
    );
    const communityPosts = approvedEvents
      .map((event) => communityService.eventToCommunityPost(event, board.id, communityAddress))
      .filter((post): post is Post => post !== null);

    if (communityPosts.length === 0) return [];

    const hydratedPosts = this.sortPosts(await this.hydratePosts(communityPosts));

    this.previewCache.set(communityAddress, {
      timestamp: Date.now(),
      posts: hydratedPosts,
    });

    return hydratedPosts.slice(0, limit);
  }

  async hydrateApprovedPost(board: Board, postEventId: string): Promise<Post | null> {
    const communityAddress = board.communityAddress || board.id;
    const approvedEvent = await communityService.fetchApprovedPostById(
      communityAddress,
      postEventId,
      board.authorRelayHints ?? board.relayHints,
    );
    if (!approvedEvent) return null;

    const nextPost = communityService.eventToCommunityPost(
      approvedEvent,
      board.id,
      communityAddress,
    );
    if (!nextPost) return null;

    const [hydratedPost] = await this.hydratePosts([nextPost]);
    if (!hydratedPost) return null;

    this.upsertPreviewCache(board, hydratedPost);
    return hydratedPost;
  }
}

export const externalCommunityDiscoveryService = new ExternalCommunityDiscoveryService();
