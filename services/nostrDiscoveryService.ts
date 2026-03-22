import type { Event as NostrEvent } from 'nostr-tools';
import type { Post } from '../types';
import { NOSTR_KINDS } from '../types';
import { nostrService } from './nostr/NostrService';
import { searchService } from './searchService';
import { externalCommunityDiscoveryService } from './externalCommunityDiscoveryService';
import { trendingScore } from './nostr/shared';
import { zapService } from './zapService';

export type DiscoveryTimeWindow = '24h' | '7d' | '30d';
export type DiscoverySourceFilter = 'all' | 'community-approved' | 'general';
export type DiscoveryRankingMode = 'breakout' | 'biggest';

export interface SeedCandidate {
  id: string;
  post: Post;
  sourceType: 'community-approved' | 'general';
  communityName?: string;
  communityAddress?: string;
  provenanceLabel: string;
  sourceDetail: string;
  approvalCount?: number;
  recentApprovalCount?: number;
  confidence: 'high' | 'medium' | 'low';
  confidenceLabel: string;
  zapCount?: number;
  zapSats?: number;
  whyTrending: string[];
  discoveryScore: number;
}

interface DiscoverSeedCandidatesOptions {
  timeWindow: DiscoveryTimeWindow;
  query?: string;
  sourceFilter?: DiscoverySourceFilter;
  rankingMode?: DiscoveryRankingMode;
  limit?: number;
}

class NostrDiscoveryService {
  private readonly DISCOVERY_BOARD_ID = '__discover_nostr__';
  private readonly GENERAL_QUALITY_THRESHOLD = 18;
  private readonly COMMUNITY_SAMPLE_LIMIT = 6;
  private readonly COMMUNITY_PREVIEW_LIMIT = 4;
  private readonly DIRECTORY_REFERENCE_THRESHOLD = 3;
  private readonly HIGH_SIGNAL_DOMAIN_PATTERNS = [
    /(^|\.)github\.com$/i,
    /(^|\.)gitlab\.com$/i,
    /(^|\.)arxiv\.org$/i,
    /(^|\.)wikipedia\.org$/i,
    /(^|\.)readthedocs\.io$/i,
    /(^|\.)stacker\.news$/i,
    /(^|\.)gov$/i,
    /(^|\.)edu$/i,
    /(^|\.)docs\./i,
  ];
  private readonly LOW_SIGNAL_DOMAIN_PATTERNS = [
    /(^|\.)x\.com$/i,
    /(^|\.)twitter\.com$/i,
    /(^|\.)instagram\.com$/i,
    /(^|\.)tiktok\.com$/i,
    /(^|\.)youtube\.com$/i,
    /(^|\.)youtu\.be$/i,
    /(^|\.)tenor\.com$/i,
    /(^|\.)giphy\.com$/i,
  ];
  private readonly SPAM_PATTERNS = [
    /signals?ia/i,
    /trade signals?/i,
    /entry:\s*\d/i,
    /btcusdc|ethusdc|solusdc/i,
    /mempool madness/i,
    /pot rolls over/i,
    /no winner this round/i,
    /verified comment/i,
    /block art/i,
    /kamikaze drones target/i,
  ];

  private getSinceTimestamp(window: DiscoveryTimeWindow): number {
    const nowSeconds = Math.floor(Date.now() / 1000);
    switch (window) {
      case '24h':
        return nowSeconds - 24 * 60 * 60;
      case '30d':
        return nowSeconds - 30 * 24 * 60 * 60;
      case '7d':
      default:
        return nowSeconds - 7 * 24 * 60 * 60;
    }
  }

  private isWithinTimeWindow(timestampMs: number, window: DiscoveryTimeWindow): boolean {
    return timestampMs >= this.getSinceTimestamp(window) * 1000;
  }

  private getCommunityAddress(event: NostrEvent): string | undefined {
    const addressTag = event.tags.find(
      (tag) => (tag[0] === 'A' || tag[0] === 'a') && tag[1]?.startsWith('34550:'),
    );
    return addressTag?.[1];
  }

  private extractUrl(event: NostrEvent, rawContent: string): string | undefined {
    const urlTag = event.tags.find(
      (tag) => (tag[0] === 'r' || tag[0] === 'url') && /^https?:\/\//i.test(tag[1] ?? ''),
    )?.[1];
    if (urlTag) return urlTag;

    const contentUrl = rawContent.match(/https?:\/\/[^\s<>()]+/i)?.[0];
    return contentUrl;
  }

  private getDomain(url?: string): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }

  private getDomainTrust(domain?: string): 'high' | 'neutral' | 'low' {
    if (!domain) return 'neutral';
    if (this.HIGH_SIGNAL_DOMAIN_PATTERNS.some((pattern) => pattern.test(domain))) return 'high';
    if (this.LOW_SIGNAL_DOMAIN_PATTERNS.some((pattern) => pattern.test(domain))) return 'low';
    return 'neutral';
  }

  private eventMatchesQuery(event: NostrEvent, query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    const title = event.tags.find((tag) => tag[0] === 'title')?.[1] ?? '';
    const tags = event.tags
      .filter((tag) => tag[0] === 't')
      .map((tag) => tag[1])
      .join(' ');
    const haystack = `${title} ${event.content} ${tags}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  }

  private countDirectoryReferences(text: string): number {
    const nostrRefs = (text.match(/nostr:[^\s]+/gi) ?? []).length;
    const bech32Refs =
      text.match(
        /\b(?:npub|nprofile|note|naddr|nevent|nsec)1[023456789acdefghjklmnpqrstuvwxyz]+\b/gi,
      )?.length ?? 0;
    return nostrRefs + bech32Refs;
  }

  private looksLikeDirectoryOrDump(text: string): boolean {
    const lineCount = text.split('\n').filter((line) => line.trim().length > 0).length;
    const directoryRefs = this.countDirectoryReferences(text);
    const listMarkers = (text.match(/(^|\n)\s*(?:[-*#]|\d+\.)\s+/g) ?? []).length;

    if (directoryRefs >= this.DIRECTORY_REFERENCE_THRESHOLD) return true;
    if (lineCount >= 8 && listMarkers >= 3) return true;
    if (/(directory|index|master list|resource list|communities list|tutorial list)/i.test(text)) {
      return true;
    }
    return false;
  }

  private matchesSpamPattern(text: string): boolean {
    return this.SPAM_PATTERNS.some((pattern) => pattern.test(text));
  }

  private isJunkCandidate(post: Post): boolean {
    const combined = `${post.title}\n${post.content}`;
    if (this.matchesSpamPattern(combined)) return true;
    if (this.looksLikeDirectoryOrDump(combined)) return true;
    return false;
  }

  private mapGeneralEventToPost(event: NostrEvent): Post | null {
    if (event.kind !== NOSTR_KINDS.POST && event.kind !== NOSTR_KINDS.COMMUNITY_POST) return null;
    if (event.tags.some((tag) => tag[0] === 'client' && tag[1] === 'bitboard')) return null;

    const rawContent = (event.content ?? '').trim();
    const firstLine = rawContent
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    const titleTag = event.tags.find((tag) => tag[0] === 'title')?.[1]?.trim();
    const title = titleTag || firstLine?.slice(0, 120) || 'Untitled Nostr post';
    const tags = event.tags
      .filter((tag) => tag[0] === 't' && tag[1])
      .map((tag) => tag[1])
      .slice(0, 8);
    const url = this.extractUrl(event, rawContent);

    return {
      id: event.id,
      nostrEventId: event.id,
      boardId: this.DISCOVERY_BOARD_ID,
      source: 'nostr',
      sourceEventKind: event.kind,
      communityAddress: this.getCommunityAddress(event),
      title,
      author: nostrService.getDisplayName(event.pubkey),
      authorPubkey: event.pubkey,
      content: rawContent,
      url,
      timestamp: event.created_at * 1000,
      score: 0,
      commentCount: 0,
      tags,
      comments: [],
      upvotes: 0,
      downvotes: 0,
    };
  }

  private scoreGeneralQuality(post: Post, zapCount = 0, zapSats = 0): number {
    const textLength = post.content.trim().length;
    const titleLength = post.title.trim().length;
    const hasLink = !!post.url;
    const hasCommunityContext = !!post.communityAddress;
    const tagCount = post.tags.length;
    const domainTrust = this.getDomainTrust(this.getDomain(post.url));
    const sentenceCount = post.content
      .split(/[.!?\n]+/)
      .filter((chunk) => chunk.trim().length > 20).length;

    let score = 0;
    score += Math.min(textLength / 45, 12);
    score += Math.min(titleLength / 20, 4);
    score += Math.min(tagCount, 4);
    score += Math.min(sentenceCount * 2, 8);
    score += hasLink ? 6 : 0;
    score += hasCommunityContext ? 5 : 0;
    score += Math.min(zapCount * 2 + zapSats / 300, 18);
    score += domainTrust === 'high' ? 5 : domainTrust === 'low' ? -2 : 0;

    if (textLength < 18 && !hasLink && tagCount === 0 && zapCount === 0) score -= 12;
    if (textLength < 40 && tagCount === 0 && !hasCommunityContext && zapCount === 0) score -= 6;
    if (/^(thanks|nice|lol|yes|no|true|same|gm|gn|ok)[.! ]*$/i.test(post.content.trim()))
      score -= 12;
    if (this.looksLikeDirectoryOrDump(`${post.title}\n${post.content}`)) score -= 20;
    if (this.matchesSpamPattern(`${post.title}\n${post.content}`)) score -= 20;

    return score;
  }

  private isEligibleGeneralPost(
    post: Post,
    window: DiscoveryTimeWindow,
    zapCount = 0,
    zapSats = 0,
  ): boolean {
    if (!this.isWithinTimeWindow(post.timestamp, window)) return false;
    if (this.isJunkCandidate(post)) return false;

    const qualityScore = this.scoreGeneralQuality(post, zapCount, zapSats);
    const hasAnySignal =
      !!post.url ||
      !!post.communityAddress ||
      post.tags.length > 0 ||
      post.title.trim().length >= 18 ||
      post.content.trim().length >= 32 ||
      zapCount > 0 ||
      zapSats > 0;

    return qualityScore >= this.GENERAL_QUALITY_THRESHOLD - 8 && hasAnySignal;
  }

  private isEligibleCommunityApprovedPost(post: Post, window: DiscoveryTimeWindow): boolean {
    if (!this.isWithinTimeWindow(post.timestamp, window)) return false;
    if (this.isJunkCandidate(post)) return false;

    const visibleContent = `${post.title} ${post.content}`.trim();
    const hasSomeSignal =
      !!post.url || post.tags.length > 0 || visibleContent.length >= 32 || post.score > 0;

    return hasSomeSignal;
  }

  private getAgeHours(timestamp: number): number {
    return Math.max(1, (Date.now() - timestamp) / (1000 * 60 * 60));
  }

  private getEngagementScore(candidate: Omit<SeedCandidate, 'discoveryScore'>): number {
    return (
      (candidate.zapCount ?? 0) * 5 +
      (candidate.zapSats ?? 0) / 80 +
      (candidate.approvalCount ?? 0) * 1.4 +
      (candidate.recentApprovalCount ?? 0) * 3 +
      candidate.post.commentCount * 2 +
      Math.max(candidate.post.score, 0) * 1.5
    );
  }

  private scoreCandidate(
    candidate: Omit<SeedCandidate, 'discoveryScore'>,
    rankingMode: DiscoveryRankingMode,
  ): number {
    const now = Date.now();
    const freshnessBase =
      trendingScore(
        candidate.post.score,
        candidate.post.commentCount,
        candidate.post.timestamp,
        now,
      ) * 100;
    const ageHours = this.getAgeHours(candidate.post.timestamp);
    const engagementScore = this.getEngagementScore(candidate);
    const contentBoost = Math.min(
      (candidate.post.title.length + candidate.post.content.length / 4) / 40,
      10,
    );
    const tagBoost = Math.min(candidate.post.tags.length, 4);
    const communityContextBoost = candidate.post.communityAddress ? 6 : 0;
    const sourceKindBoost = candidate.post.sourceEventKind === NOSTR_KINDS.COMMUNITY_POST ? 6 : 0;
    const confidenceBoost =
      candidate.confidence === 'high' ? 10 : candidate.confidence === 'medium' ? 5 : 0;
    const zapBoost = Math.min((candidate.zapCount ?? 0) * 2 + (candidate.zapSats ?? 0) / 250, 28);
    const linkBoost = candidate.post.url ? 8 : 0;
    const domainTrust = this.getDomainTrust(this.getDomain(candidate.post.url));
    const domainTrustBoost = domainTrust === 'high' ? 5 : domainTrust === 'low' ? -3 : 0;
    const approvalBoost =
      candidate.sourceType === 'community-approved'
        ? 10 + (candidate.approvalCount ?? 0) * 1.2 + (candidate.recentApprovalCount ?? 0) * 2
        : 0;

    const breakoutFreshness = Math.max(0, 72 - ageHours) * 2.2;
    const breakoutMomentum = Math.min(engagementScore * 1.8, 90);
    const breakoutDensity = Math.min((engagementScore / (ageHours + 2)) * 18, 110);

    const biggestEngagement = Math.min(engagementScore * 3, 170);
    const biggestRecency = Math.max(0, 48 - ageHours) * 0.8;

    const rankingBoost =
      rankingMode === 'breakout'
        ? breakoutFreshness + breakoutMomentum + breakoutDensity + freshnessBase * 0.35
        : biggestEngagement + biggestRecency + freshnessBase * 0.18;

    return (
      rankingBoost +
      contentBoost +
      tagBoost +
      communityContextBoost +
      sourceKindBoost +
      confidenceBoost +
      zapBoost +
      linkBoost +
      domainTrustBoost +
      approvalBoost
    );
  }

  private buildWhyTrending(candidate: Omit<SeedCandidate, 'discoveryScore'>): string[] {
    const reasons: string[] = [];

    const ageHours = Math.max(0, (Date.now() - candidate.post.timestamp) / (1000 * 60 * 60));
    if (ageHours <= 24) {
      reasons.push('fresh activity');
    }

    if ((candidate.approvalCount ?? 0) > 0) {
      reasons.push(`${candidate.approvalCount} moderator-approved posts in source community`);
    }

    if ((candidate.recentApprovalCount ?? 0) > 0) {
      reasons.push(`${candidate.recentApprovalCount} recent community approvals`);
    }

    if ((candidate.zapCount ?? 0) > 0) {
      reasons.push(`${candidate.zapCount} zaps / ${candidate.zapSats ?? 0} sats`);
    }

    if (candidate.post.url) {
      const domain = this.getDomain(candidate.post.url);
      const trust = this.getDomainTrust(domain);
      reasons.push(
        trust === 'high'
          ? `links to high-signal source ${domain ?? 'external source'}`
          : `links to ${domain ?? 'an external source'}`,
      );
    }

    if (candidate.post.tags.length >= 3) {
      reasons.push('strong topical metadata');
    }

    if (candidate.post.sourceEventKind === NOSTR_KINDS.COMMUNITY_POST) {
      reasons.push('native NIP-72 community post');
    }

    if (reasons.length === 0) {
      reasons.push('recent cross-relay discovery');
    }

    return reasons.slice(0, 3);
  }

  private dedupeCandidates(candidates: SeedCandidate[]): SeedCandidate[] {
    const byId = new Map<string, SeedCandidate>();
    for (const candidate of candidates) {
      const existing = byId.get(candidate.id);
      if (!existing || candidate.discoveryScore > existing.discoveryScore) {
        byId.set(candidate.id, candidate);
      }
    }
    return this.diversifyCandidates(
      Array.from(byId.values()).sort((a, b) => b.discoveryScore - a.discoveryScore),
    );
  }

  private diversifyCandidates(candidates: SeedCandidate[]): SeedCandidate[] {
    const remaining = [...candidates];
    const ordered: SeedCandidate[] = [];
    const authorCounts = new Map<string, number>();
    const domainCounts = new Map<string, number>();

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestScore = -Infinity;

      remaining.forEach((candidate, index) => {
        const authorPenalty = candidate.post.authorPubkey
          ? (authorCounts.get(candidate.post.authorPubkey) ?? 0) * 18
          : 0;
        const domain = this.getDomain(candidate.post.url);
        const domainPenalty = domain ? (domainCounts.get(domain) ?? 0) * 10 : 0;
        const adjustedScore = candidate.discoveryScore - authorPenalty - domainPenalty;
        if (adjustedScore > bestScore) {
          bestScore = adjustedScore;
          bestIndex = index;
        }
      });

      const [selected] = remaining.splice(bestIndex, 1);
      ordered.push(selected);
      if (selected.post.authorPubkey) {
        authorCounts.set(
          selected.post.authorPubkey,
          (authorCounts.get(selected.post.authorPubkey) ?? 0) + 1,
        );
      }
      const domain = this.getDomain(selected.post.url);
      if (domain) {
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      }
    }

    return ordered;
  }

  private async fetchGeneralCandidates(
    opts: DiscoverSeedCandidatesOptions,
  ): Promise<SeedCandidate[]> {
    const query = opts.query?.trim();
    const events = query
      ? await searchService.relaySearch(query, {
          kinds: [NOSTR_KINDS.POST, NOSTR_KINDS.COMMUNITY_POST],
          limit: opts.limit ?? 60,
          since: this.getSinceTimestamp(opts.timeWindow),
        })
      : await nostrService.queryEvents({
          kinds: [NOSTR_KINDS.POST, NOSTR_KINDS.COMMUNITY_POST],
          limit: opts.limit ?? 120,
          since: this.getSinceTimestamp(opts.timeWindow),
        });

    const posts = events
      .filter((event) => !query || this.eventMatchesQuery(event, query))
      .map((event) => this.mapGeneralEventToPost(event))
      .filter((post): post is Post => post !== null);

    const zapTallies = await zapService.getZapTalliesForEvents(
      posts.map((post) => post.nostrEventId).filter(Boolean) as string[],
    );

    const filteredPosts = posts.filter((post) => {
      const zapCount = post.nostrEventId ? (zapTallies.get(post.nostrEventId)?.zapCount ?? 0) : 0;
      const zapSats = post.nostrEventId ? (zapTallies.get(post.nostrEventId)?.totalSats ?? 0) : 0;
      return this.isEligibleGeneralPost(post, opts.timeWindow, zapCount, zapSats);
    });

    const pubkeys = Array.from(
      new Set(filteredPosts.map((post) => post.authorPubkey).filter(Boolean) as string[]),
    );
    if (pubkeys.length > 0) {
      await nostrService.fetchProfiles(pubkeys);
    }

    return filteredPosts.map((post) => {
      const zapCount = post.nostrEventId ? (zapTallies.get(post.nostrEventId)?.zapCount ?? 0) : 0;
      const zapSats = post.nostrEventId ? (zapTallies.get(post.nostrEventId)?.totalSats ?? 0) : 0;
      const normalized: Omit<SeedCandidate, 'discoveryScore'> = {
        id: post.id,
        post: {
          ...post,
          author: post.authorPubkey ? nostrService.getDisplayName(post.authorPubkey) : post.author,
        },
        sourceType: 'general',
        communityAddress: post.communityAddress,
        provenanceLabel: post.communityAddress ? 'Community Post' : 'General Nostr',
        sourceDetail:
          post.sourceEventKind === NOSTR_KINDS.COMMUNITY_POST
            ? `Native NIP-72 community post discovered on relays${post.url ? ` · ${this.getDomain(post.url) ?? 'linked source'}` : ''}`
            : `General Nostr note discovered across current relays${post.url ? ` · ${this.getDomain(post.url) ?? 'linked source'}` : ''}`,
        confidence: post.url
          ? post.communityAddress
            ? 'high'
            : 'medium'
          : post.communityAddress
            ? 'medium'
            : 'low',
        confidenceLabel: post.url
          ? 'Link-backed'
          : post.communityAddress
            ? 'Context-rich'
            : 'Broad signal',
        zapCount,
        zapSats,
        whyTrending: [],
      };
      const hydrated = { ...normalized, whyTrending: this.buildWhyTrending(normalized) };
      return {
        ...hydrated,
        discoveryScore: this.scoreCandidate(hydrated, opts.rankingMode ?? 'breakout'),
      };
    });
  }

  private async fetchCommunityApprovedCandidates(
    opts: DiscoverSeedCandidatesOptions,
  ): Promise<SeedCandidate[]> {
    const discovered = await externalCommunityDiscoveryService.discoverCommunities();
    const topCommunities = discovered.slice(0, this.COMMUNITY_SAMPLE_LIMIT);
    const previewGroups = await Promise.all(
      topCommunities.map(async (community) => ({
        community,
        posts: await externalCommunityDiscoveryService.fetchCommunityPreview(
          community.board,
          this.COMMUNITY_PREVIEW_LIMIT,
          false,
        ),
      })),
    );

    const query = opts.query?.trim().toLowerCase();

    return previewGroups.flatMap(({ community, posts }) =>
      posts
        .filter((post) => {
          if (!this.isEligibleCommunityApprovedPost(post, opts.timeWindow)) return false;
          if (!query) return true;
          const haystack =
            `${post.title} ${post.content} ${post.tags.join(' ')} ${community.community.name}`.toLowerCase();
          return haystack.includes(query);
        })
        .map((post) => {
          const normalized: Omit<SeedCandidate, 'discoveryScore'> = {
            id: post.id,
            post,
            sourceType: 'community-approved',
            communityName: community.community.name,
            communityAddress: community.community.address,
            approvalCount: community.approvalCount,
            recentApprovalCount: community.recentApprovalCount,
            provenanceLabel: `Approved in ${community.community.name}`,
            sourceDetail: `${community.approvalCount} approved posts, ${community.recentApprovalCount} approvals this week`,
            confidence: 'high',
            confidenceLabel: 'Moderator-approved',
            zapCount: 0,
            zapSats: 0,
            whyTrending: [],
          };
          const hydrated = { ...normalized, whyTrending: this.buildWhyTrending(normalized) };
          return {
            ...hydrated,
            discoveryScore: this.scoreCandidate(hydrated, opts.rankingMode ?? 'breakout'),
          };
        }),
    );
  }

  async discoverSeedCandidates(opts: DiscoverSeedCandidatesOptions): Promise<SeedCandidate[]> {
    const sourceFilter = opts.sourceFilter ?? 'all';
    const [communityApproved, general] = await Promise.all([
      sourceFilter === 'all' || sourceFilter === 'community-approved'
        ? this.fetchCommunityApprovedCandidates(opts)
        : Promise.resolve([]),
      sourceFilter === 'all' || sourceFilter === 'general'
        ? this.fetchGeneralCandidates(opts)
        : Promise.resolve([]),
    ]);

    const candidates: SeedCandidate[] = [...communityApproved, ...general];
    return this.dedupeCandidates(candidates).slice(0, opts.limit ?? 60);
  }
}

export const nostrDiscoveryService = new NostrDiscoveryService();
