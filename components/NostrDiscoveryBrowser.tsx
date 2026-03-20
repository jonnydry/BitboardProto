import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Compass,
  ExternalLink,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import type { Board, Post } from '../types';
import {
  nostrDiscoveryService,
  type DiscoverySourceFilter,
  type DiscoveryTimeWindow,
  type SeedCandidate,
} from '../services/nostrDiscoveryService';
import {
  fetchLinkPreview,
  getCachedPreview,
  type LinkPreviewData,
} from '../services/linkPreviewService';
import { ExternalCommunitiesBrowser } from './ExternalCommunitiesBrowser';

interface NostrDiscoveryBrowserProps {
  externalCommunities: Board[];
  onNavigateToBoard: (id: string | null) => void;
  onJoinNostrCommunity: (reference: string) => Promise<string>;
  onClose: () => void;
  onSeedPost?: (post: Post) => void;
}

type DiscoverTab = 'trending' | 'communities';

const timeWindowOptions: DiscoveryTimeWindow[] = ['24h', '7d', '30d'];
const sourceOptions: Array<{ value: DiscoverySourceFilter; label: string }> = [
  { value: 'all', label: 'All Sources' },
  { value: 'community-approved', label: 'Community Approved' },
  { value: 'general', label: 'General Nostr' },
];

export function NostrDiscoveryBrowser({
  externalCommunities,
  onNavigateToBoard,
  onJoinNostrCommunity,
  onClose,
  onSeedPost,
}: NostrDiscoveryBrowserProps) {
  const [activeTab, setActiveTab] = useState<DiscoverTab>('trending');
  const [query, setQuery] = useState('');
  const [timeWindow, setTimeWindow] = useState<DiscoveryTimeWindow>('24h');
  const [sourceFilter, setSourceFilter] = useState<DiscoverySourceFilter>('all');
  const [candidates, setCandidates] = useState<SeedCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [linkPreviews, setLinkPreviews] = useState<Record<string, LinkPreviewData>>({});
  const requestIdRef = useRef(0);

  const formatAge = (timestamp: number) => {
    const diffHours = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60)));
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  };

  const getDomain = (url?: string) => {
    if (!url) return null;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  };

  const loadCandidates = async (params?: {
    query?: string;
    timeWindow?: DiscoveryTimeWindow;
    sourceFilter?: DiscoverySourceFilter;
  }) => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const nextCandidates = await nostrDiscoveryService.discoverSeedCandidates({
        query: params?.query ?? query,
        timeWindow: params?.timeWindow ?? timeWindow,
        sourceFilter: params?.sourceFilter ?? sourceFilter,
        limit: 60,
      });
      if (requestId !== requestIdRef.current) return;
      setCandidates(nextCandidates);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Failed to discover Nostr posts.');
    } finally {
      if (requestId !== requestIdRef.current) return;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'trending') return;
    const nextQuery = query.trim();
    const timeout = window.setTimeout(
      () => {
        void loadCandidates({ query: nextQuery, timeWindow, sourceFilter });
      },
      nextQuery ? 250 : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [activeTab, query, timeWindow, sourceFilter]);

  useEffect(() => {
    if (activeTab !== 'trending') return;
    if (!candidates.some((candidate) => candidate.post.url)) return;
    let cancelled = false;

    candidates
      .filter((candidate) => !!candidate.post.url)
      .slice(0, 6)
      .forEach((candidate) => {
        const url = candidate.post.url;
        if (!url) return;

        const cached = getCachedPreview(url);
        if (cached) {
          setLinkPreviews((current) => (current[url] ? current : { ...current, [url]: cached }));
          return;
        }

        setLinkPreviews((current) => {
          if (current[url]?.loading) return current;
          return {
            ...current,
            [url]: current[url] ?? { url, loading: true },
          };
        });

        void fetchLinkPreview(url)
          .then((preview) => {
            if (cancelled) return;
            setLinkPreviews((current) => ({ ...current, [url]: preview }));
          })
          .catch(() => {
            if (cancelled) return;
            setLinkPreviews((current) => ({
              ...current,
              [url]: { url, error: 'Failed to load preview' },
            }));
          });
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, candidates]);

  const summary = useMemo(() => {
    const approved = candidates.filter(
      (candidate) => candidate.sourceType === 'community-approved',
    ).length;
    const general = candidates.filter((candidate) => candidate.sourceType === 'general').length;
    const highConfidence = candidates.filter((candidate) => candidate.confidence === 'high').length;
    const mediumConfidence = candidates.filter(
      (candidate) => candidate.confidence === 'medium',
    ).length;
    const lowConfidence = candidates.filter((candidate) => candidate.confidence === 'low').length;
    const communityContext = candidates.filter((candidate) => candidate.communityName).length;
    const averageRank =
      candidates.length > 0
        ? candidates.reduce((sum, candidate) => sum + candidate.discoveryScore, 0) /
          candidates.length
        : 0;
    const topAuthors = Array.from(
      candidates.slice(0, 20).reduce((map, candidate) => {
        const key = candidate.post.author;
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topDomains = Array.from(
      candidates.slice(0, 20).reduce((map, candidate) => {
        const domain = getDomain(candidate.post.url);
        if (!domain) return map;
        map.set(domain, (map.get(domain) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return {
      approved,
      general,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      communityContext,
      averageRank,
      topAuthors,
      topDomains,
    };
  }, [candidates]);

  return (
    <div className="animate-fade-in space-y-6">
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text uppercase text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      <div className="overflow-hidden border border-terminal-dim/30 bg-gradient-to-br from-terminal-text/10 via-terminal-bg to-terminal-bg">
        <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)] lg:px-6">
          <div>
            <div className="inline-flex items-center gap-2 border border-terminal-dim/40 bg-terminal-bg/60 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-terminal-dim">
              <Sparkles size={12} /> Seedable Signal
            </div>
            <h2 className="mt-4 flex items-center gap-3 text-3xl font-terminal uppercase tracking-[0.18em] text-terminal-text">
              <Compass size={26} />
              DISCOVER NOSTR
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-terminal-dim">
              Find high-integrity Nostr posts worth importing into BitBoard. Broad trending is the
              entry point, but the feed now heavily favors stronger context, moderator approval,
              links, and visible engagement.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-terminal-dim">
              <span className="border border-terminal-dim/30 bg-terminal-bg/60 px-2 py-1">
                {candidates.length} candidates
              </span>
              <span className="border border-terminal-dim/30 bg-terminal-bg/60 px-2 py-1">
                {summary.approved} approved
              </span>
              <span className="border border-terminal-dim/30 bg-terminal-bg/60 px-2 py-1">
                {summary.highConfidence} high confidence
              </span>
              <span className="border border-terminal-dim/30 bg-terminal-bg/60 px-2 py-1">
                {summary.communityContext} with context
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-terminal-dim/30 bg-terminal-bg/70 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-terminal-dim">
                Source Mix
              </div>
              <div className="mt-3 text-2xl font-terminal text-terminal-text">
                {summary.approved}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-terminal-dim">
                community-approved posts
              </div>
            </div>
            <div className="border border-terminal-dim/30 bg-terminal-bg/70 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-terminal-dim">
                Broad Feed
              </div>
              <div className="mt-3 text-2xl font-terminal text-terminal-text">
                {summary.general}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-terminal-dim">
                general nostr candidates
              </div>
            </div>
            <div className="border border-terminal-dim/30 bg-terminal-bg/70 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-terminal-dim">
                Confidence
              </div>
              <div className="mt-3 text-2xl font-terminal text-terminal-text">
                {summary.highConfidence}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-terminal-dim">
                high-confidence seeds
              </div>
            </div>
            <div className="border border-terminal-dim/30 bg-terminal-bg/70 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-terminal-dim">
                Average Rank
              </div>
              <div className="mt-3 text-2xl font-terminal text-terminal-text">
                {summary.averageRank.toFixed(1)}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-terminal-dim">
                quality-weighted score
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-terminal-dim/20 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('trending')}
          className={`border px-3 py-2 text-xs uppercase tracking-wide ${
            activeTab === 'trending'
              ? 'border-terminal-text bg-terminal-text/10 text-terminal-text'
              : 'border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text'
          }`}
        >
          Trending
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('communities')}
          className={`border px-3 py-2 text-xs uppercase tracking-wide ${
            activeTab === 'communities'
              ? 'border-terminal-dim bg-terminal-dim/10 text-terminal-dim'
              : 'border-terminal-dim/60 text-terminal-dim/80 hover:border-terminal-dim hover:text-terminal-dim'
          }`}
        >
          Communities (Secondary)
        </button>
      </div>

      {activeTab === 'communities' ? (
        <ExternalCommunitiesBrowser
          externalCommunities={externalCommunities}
          onNavigateToBoard={onNavigateToBoard}
          onJoinNostrCommunity={onJoinNostrCommunity}
          onClose={() => setActiveTab('trending')}
          onSeedPost={onSeedPost}
          embedded
        />
      ) : (
        <>
          <div className="border border-terminal-dim/30 bg-terminal-bg/30 p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-terminal-dim">
              <Search size={12} />
              Search And Refine
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_14rem]">
              <label className="relative block">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-terminal-dim"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search broad trending Nostr posts..."
                  className="w-full border border-terminal-dim bg-terminal-bg py-3 pl-9 pr-4 text-sm text-terminal-text focus:border-terminal-text focus:outline-none"
                />
              </label>

              <select
                value={timeWindow}
                onChange={(event) => setTimeWindow(event.target.value as DiscoveryTimeWindow)}
                className="border border-terminal-dim bg-terminal-bg px-3 py-3 text-sm text-terminal-text focus:border-terminal-text focus:outline-none"
              >
                {timeWindowOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </select>

              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as DiscoverySourceFilter)}
                className="border border-terminal-dim bg-terminal-bg px-3 py-3 text-sm text-terminal-text focus:border-terminal-text focus:outline-none"
              >
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border border-terminal-dim/30 bg-terminal-bg/30 px-4 py-3 text-xs uppercase tracking-wide text-terminal-dim">
            <div className="flex items-center gap-2">
              <Sparkles size={12} />
              Broad trending is the default, but the feed now filters for stronger seed candidates
              instead of raw chatter.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDiagnostics((current) => !current)}
                className="inline-flex items-center gap-2 border border-terminal-dim px-3 py-1.5 text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text"
              >
                Diagnostics
                <ChevronDown
                  size={12}
                  className={
                    showDiagnostics ? 'rotate-180 transition-transform' : 'transition-transform'
                  }
                />
              </button>
              <button
                type="button"
                onClick={() => void loadCandidates()}
                disabled={isLoading}
                className="inline-flex items-center gap-2 border border-terminal-dim px-3 py-1.5 text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text disabled:opacity-60"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {showDiagnostics && (
            <div className="grid gap-3 border border-terminal-dim/30 bg-terminal-bg/20 p-4 text-xs uppercase tracking-wide text-terminal-dim md:grid-cols-5">
              <div>
                <div className="text-terminal-text">Source Mix</div>
                <div className="mt-2 space-y-1">
                  <div>{summary.approved} approved</div>
                  <div>{summary.general} general</div>
                  <div>{summary.communityContext} with community context</div>
                </div>
              </div>
              <div>
                <div className="text-terminal-text">Confidence Mix</div>
                <div className="mt-2 space-y-1">
                  <div>{summary.highConfidence} high</div>
                  <div>{summary.mediumConfidence} medium</div>
                  <div>{summary.lowConfidence} low</div>
                </div>
              </div>
              <div>
                <div className="text-terminal-text">Feed Quality</div>
                <div className="mt-2 space-y-1">
                  <div>Window {timeWindow}</div>
                  <div>Filter {sourceFilter}</div>
                  <div>Avg rank {summary.averageRank.toFixed(1)}</div>
                </div>
              </div>
              <div>
                <div className="text-terminal-text">Top Authors</div>
                <div className="mt-2 space-y-1">
                  {summary.topAuthors.length > 0 ? (
                    summary.topAuthors.map(([author, count]) => (
                      <div key={author} className="truncate">
                        {author} x{count}
                      </div>
                    ))
                  ) : (
                    <div>none</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-terminal-text">Top Domains</div>
                <div className="mt-2 space-y-1">
                  {summary.topDomains.length > 0 ? (
                    summary.topDomains.map(([domain, count]) => (
                      <div key={domain} className="truncate">
                        {domain} x{count}
                      </div>
                    ))
                  ) : (
                    <div>none</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-3 border border-terminal-dim bg-terminal-bg/40 p-6 text-sm text-terminal-dim">
              <Loader2 size={16} className="animate-spin" /> Loading seedable Nostr posts...
            </div>
          )}

          {error && (
            <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-4 text-sm text-terminal-alert">
              {error}
            </div>
          )}

          {!isLoading && !error && candidates.length === 0 && (
            <div className="border border-terminal-dim bg-terminal-bg/40 p-8 text-center text-terminal-dim">
              <Radio size={28} className="mx-auto mb-3 opacity-40" />
              <div className="font-bold uppercase text-terminal-text">No seedable posts found</div>
              <p className="mt-2 text-xs uppercase tracking-wide text-terminal-dim">
                Try a broader time window or remove some search terms.
              </p>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="space-y-3">
              {candidates.map((candidate) => (
                <article
                  key={candidate.id}
                  className="overflow-hidden border border-terminal-dim/40 bg-terminal-bg/60"
                >
                  {candidate.post.url && linkPreviews[candidate.post.url] && (
                    <div className="border-b border-terminal-dim/20 bg-terminal-bg/80 px-4 py-3">
                      <div className="flex items-start gap-3">
                        {linkPreviews[candidate.post.url].favicon ? (
                          <img
                            src={linkPreviews[candidate.post.url].favicon}
                            alt=""
                            className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
                          />
                        ) : (
                          <ExternalLink size={14} className="mt-0.5 shrink-0 text-terminal-dim" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-terminal-dim">
                            Source Preview
                          </div>
                          <div className="mt-1 text-sm font-semibold text-terminal-text">
                            {linkPreviews[candidate.post.url].title ||
                              getDomain(candidate.post.url)}
                          </div>
                          {(linkPreviews[candidate.post.url].siteName ||
                            getDomain(candidate.post.url)) && (
                            <div className="mt-1 text-[11px] uppercase tracking-wide text-terminal-dim/80">
                              {linkPreviews[candidate.post.url].siteName ||
                                getDomain(candidate.post.url)}
                            </div>
                          )}
                          {linkPreviews[candidate.post.url].description && (
                            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-terminal-dim">
                              {linkPreviews[candidate.post.url].description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="border-b border-terminal-dim/20 bg-terminal-bg/70 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-terminal-dim">
                      <span className="border border-terminal-dim/30 px-2 py-0.5 uppercase tracking-wide text-terminal-text">
                        {candidate.provenanceLabel}
                      </span>
                      <span className="border border-terminal-dim/30 px-2 py-0.5 uppercase tracking-wide">
                        {candidate.confidenceLabel}
                      </span>
                      {candidate.post.url && (
                        <span className="border border-terminal-text/20 bg-terminal-text/5 px-2 py-0.5 uppercase tracking-wide text-terminal-text">
                          Link-backed
                        </span>
                      )}
                      {candidate.communityName && <span>{candidate.communityName}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-terminal-dim/80">
                      <span>{candidate.post.author}</span>
                      <span>•</span>
                      <span>{formatAge(candidate.post.timestamp)}</span>
                      <span>•</span>
                      <span>Rank {candidate.discoveryScore.toFixed(1)}</span>
                      {candidate.zapCount ? (
                        <>
                          <span>•</span>
                          <span>{candidate.zapCount} zaps</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold leading-snug text-terminal-text">
                          {candidate.post.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-terminal-dim">
                          {candidate.post.content}
                        </p>
                      </div>
                      {candidate.post.url && (
                        <a
                          href={candidate.post.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-2 border border-terminal-dim/40 px-3 py-2 text-[11px] uppercase tracking-wide text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text"
                        >
                          <ExternalLink size={12} />
                          {getDomain(candidate.post.url) ?? 'Open Link'}
                        </a>
                      )}
                    </div>
                    <div className="mt-3 text-xs uppercase tracking-wide text-terminal-dim/80">
                      {candidate.sourceDetail}
                    </div>
                    {candidate.whyTrending.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {candidate.whyTrending.map((reason) => (
                          <span
                            key={`${candidate.id}-${reason}`}
                            className="border border-terminal-text/20 bg-terminal-text/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-terminal-dim"
                          >
                            Why: {reason}
                          </span>
                        ))}
                      </div>
                    )}
                    {candidate.post.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {candidate.post.tags.slice(0, 5).map((tag) => (
                          <span
                            key={`${candidate.id}-${tag}`}
                            className="border border-terminal-dim/30 px-2 py-0.5 text-[11px] uppercase text-terminal-dim"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-terminal-dim/20 bg-terminal-bg/40 px-4 py-3 text-xs uppercase tracking-wide">
                    <div className="flex flex-wrap items-center gap-3 text-terminal-dim">
                      <span>
                        {candidate.sourceType === 'community-approved'
                          ? 'Community-approved'
                          : 'General Nostr'}
                      </span>
                      <span>•</span>
                      <span>{candidate.confidence} confidence</span>
                    </div>
                    {onSeedPost && (
                      <button
                        type="button"
                        onClick={() => onSeedPost(candidate.post)}
                        className="border border-terminal-text/50 bg-terminal-text/5 px-3 py-1 text-terminal-text transition-colors hover:bg-terminal-text hover:text-terminal-bg"
                      >
                        Seed To BitBoard
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
