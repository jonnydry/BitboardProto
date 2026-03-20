import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { Board, Post } from '../types';
import {
  externalCommunityDiscoveryService,
  type DiscoveredCommunity,
} from '../services/externalCommunityDiscoveryService';
import { communityService } from '../services/communityService';
import { nostrService } from '../services/nostr/NostrService';

interface ExternalCommunitiesBrowserProps {
  externalCommunities: Board[];
  onNavigateToBoard: (id: string | null) => void;
  onJoinNostrCommunity: (reference: string) => Promise<string>;
  onClose: () => void;
  onSeedPost?: (post: Post) => void;
  embedded?: boolean;
}

export function ExternalCommunitiesBrowser({
  externalCommunities,
  onNavigateToBoard,
  onJoinNostrCommunity,
  onClose,
  onSeedPost,
  embedded = false,
}: ExternalCommunitiesBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [discoveredCommunities, setDiscoveredCommunities] = useState<DiscoveredCommunity[]>([]);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);
  const [previewPosts, setPreviewPosts] = useState<Post[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [joiningAddress, setJoiningAddress] = useState<string | null>(null);
  const [communityInput, setCommunityInput] = useState('');
  const [manualAddError, setManualAddError] = useState<string | null>(null);
  const [manualAddSuccess, setManualAddSuccess] = useState<string | null>(null);
  const [isAddingManualCommunity, setIsAddingManualCommunity] = useState(false);
  const [visibleCountsBySection, setVisibleCountsBySection] = useState<Record<string, number>>({});
  const [relayStatuses, setRelayStatuses] = useState(nostrService.getRelayStatuses());
  const SECTION_PAGE_SIZE = 12;

  const formatRelativeAge = (timestamp?: number) => {
    if (!timestamp) return 'No recent approvals';
    const ms = Date.now() - timestamp;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Active today';
    if (days === 1) return 'Active 1 day ago';
    if (days < 30) return `Active ${days} days ago`;
    const months = Math.floor(days / 30);
    if (months <= 1) return 'Active 1 month ago';
    return `Active ${months} months ago`;
  };

  const loadCommunities = async (forceRefresh = false) => {
    setIsLoadingCommunities(true);
    setCommunitiesError(null);
    try {
      const discovered = await externalCommunityDiscoveryService.discoverCommunities({
        forceRefresh,
      });
      setDiscoveredCommunities(discovered);
    } catch (error) {
      setCommunitiesError(
        error instanceof Error ? error.message : 'Failed to discover Nostr communities.',
      );
    } finally {
      setIsLoadingCommunities(false);
    }
  };

  useEffect(() => {
    void loadCommunities();
  }, []);

  useEffect(() => {
    const syncRelayStatuses = () => {
      setRelayStatuses(nostrService.getRelayStatuses());
    };

    syncRelayStatuses();
    const interval = window.setInterval(syncRelayStatuses, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredCommunities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return discoveredCommunities;
    return discoveredCommunities.filter((entry) => {
      const haystack = `${entry.community.name} ${entry.community.description ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [discoveredCommunities, searchQuery]);

  const sections = useMemo(
    () => externalCommunityDiscoveryService.buildSections(filteredCommunities),
    [filteredCommunities],
  );

  useEffect(() => {
    setVisibleCountsBySection((current) => {
      const next: Record<string, number> = {};
      sections.forEach((section) => {
        next[section.id] = current[section.id] ?? SECTION_PAGE_SIZE;
      });
      return next;
    });
  }, [sections]);

  useEffect(() => {
    if (filteredCommunities.length === 0) {
      setSelectedCommunityId(null);
      return;
    }

    setSelectedCommunityId((current) => {
      if (current && filteredCommunities.some((entry) => entry.board.id === current)) {
        return current;
      }
      return filteredCommunities[0]?.board.id ?? null;
    });
  }, [filteredCommunities]);

  const selectedCommunity = useMemo(
    () => filteredCommunities.find((entry) => entry.board.id === selectedCommunityId) ?? null,
    [filteredCommunities, selectedCommunityId],
  );

  const relaySummary = useMemo(() => {
    const total = relayStatuses.length;
    const connected = relayStatuses.filter((status) => status.isConnected).length;
    return {
      total,
      connected,
      partial: total > 0 && connected > 0 && connected < total,
      offline: total > 0 && connected === 0,
    };
  }, [relayStatuses]);

  const savedCommunityIds = useMemo(
    () => new Set(externalCommunities.map((board) => board.id)),
    [externalCommunities],
  );

  useEffect(() => {
    if (!selectedCommunity) {
      setPreviewPosts([]);
      setPreviewError(null);
      setIsLoadingPreview(false);
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      setIsLoadingPreview(true);
      setPreviewError(null);
      setPreviewPosts([]);
      try {
        const posts = await externalCommunityDiscoveryService.fetchCommunityPreview(
          selectedCommunity.board,
          8,
          false,
        );
        if (!cancelled) setPreviewPosts(posts);
      } catch (error) {
        if (!cancelled) {
          setPreviewError(
            error instanceof Error ? error.message : 'Failed to load community preview.',
          );
        }
      } finally {
        if (!cancelled) setIsLoadingPreview(false);
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [selectedCommunity]);

  useEffect(() => {
    if (!selectedCommunity) return;

    const communityAddress =
      selectedCommunity.community.address ||
      selectedCommunity.board.communityAddress ||
      selectedCommunity.board.id;
    const overlapSince = Math.max(0, Math.floor(Date.now() / 1000) - 30);
    let cancelled = false;

    const subscriptionId = nostrService.subscribeToCommunityApprovals(
      communityAddress,
      async (event) => {
        if (cancelled) return;

        const approval = communityService.upsertApprovalEvent(event);
        if (!approval || cancelled) return;

        try {
          const nextPost = await externalCommunityDiscoveryService.hydrateApprovedPost(
            selectedCommunity.board,
            approval.postEventId,
          );

          if (!nextPost || cancelled) return;

          setPreviewPosts((current) => {
            const merged = [...current.filter((post) => post.id !== nextPost.id), nextPost].sort(
              (a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return b.timestamp - a.timestamp;
              },
            );
            return merged.slice(0, 8);
          });
        } catch (error) {
          if (!cancelled) {
            console.warn(
              '[ExternalCommunitiesBrowser] Failed to process live approval update',
              error,
            );
          }
        }
      },
      {
        since: overlapSince,
        relayHints:
          selectedCommunity.board.approvalRelayHints ?? selectedCommunity.board.relayHints,
      },
    );

    return () => {
      cancelled = true;
      nostrService.unsubscribe(subscriptionId);
    };
  }, [selectedCommunity]);

  const handleSaveCommunity = async (entry: DiscoveredCommunity) => {
    const address = entry.community.address || entry.board.id;
    setJoiningAddress(address);
    try {
      await onJoinNostrCommunity(address);
    } finally {
      setJoiningAddress(null);
    }
  };

  const handleManualAdd = async () => {
    const reference = communityInput.trim();
    if (!reference) {
      setManualAddError('Paste a community address or naddr to add it.');
      return;
    }

    setIsAddingManualCommunity(true);
    setManualAddError(null);
    setManualAddSuccess(null);
    try {
      const boardId = await onJoinNostrCommunity(reference);
      setCommunityInput('');
      setManualAddSuccess('Community added to your saved external communities.');
      await loadCommunities(true);
      setSelectedCommunityId(boardId);
    } catch (error) {
      setManualAddError(error instanceof Error ? error.message : 'Failed to add community.');
    } finally {
      setIsAddingManualCommunity(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {!embedded && (
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text uppercase text-sm font-bold group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          BACK TO FEED
        </button>
      )}

      <div className="border-b border-terminal-dim/30 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-terminal uppercase tracking-widest text-terminal-text">
              <ExternalLink size={22} />
              EXTERNAL COMMUNITIES
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-terminal-dim">
              Discover moderated Nostr communities, inspect their approved posts, and seed the best
              notes into native BitBoard boards.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-terminal-dim">
            <span>{discoveredCommunities.length} discovered</span>
            <span>•</span>
            <span>{externalCommunities.length} saved</span>
            <span>•</span>
            <span>
              relays {relaySummary.connected}/{relaySummary.total}
            </span>
          </div>
        </div>
      </div>

      <div
        className={`border px-4 py-3 text-xs uppercase tracking-wide ${
          relaySummary.offline
            ? 'border-terminal-alert/40 bg-terminal-alert/5 text-terminal-alert'
            : relaySummary.partial
              ? 'border-yellow-500/40 bg-yellow-500/5 text-yellow-400'
              : 'border-terminal-dim/30 bg-terminal-bg/30 text-terminal-dim'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {relaySummary.offline ? <WifiOff size={13} /> : <Wifi size={13} />}
          <span>
            {relaySummary.offline
              ? 'No read relays are connected. Discovery results may be stale or empty.'
              : relaySummary.partial
                ? `Partial relay coverage: ${relaySummary.connected}/${relaySummary.total} relays connected, so discovery may be incomplete.`
                : 'Relay coverage looks healthy. Discovery is using all connected read relays.'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <label className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-terminal-dim"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search Nostr communities..."
            className="w-full border border-terminal-dim bg-terminal-bg py-3 pl-9 pr-4 text-sm text-terminal-text focus:border-terminal-text focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadCommunities(true)}
          disabled={isLoadingCommunities}
          className="inline-flex items-center justify-center gap-2 border border-terminal-dim px-4 py-3 text-xs uppercase tracking-wide text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text disabled:opacity-60"
        >
          <RefreshCw size={14} className={isLoadingCommunities ? 'animate-spin' : ''} />
          Refresh Discovery
        </button>
      </div>

      <div className="border border-terminal-dim bg-terminal-bg/40 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-terminal-dim">
              Add by community address
            </div>
            <p className="mt-1 text-xs text-terminal-dim/80">
              Secondary path for communities you already know. Paste a `34550:pubkey:d` address or
              `naddr`.
            </p>
          </div>
          <div className="flex w-full max-w-xl gap-2">
            <input
              type="text"
              value={communityInput}
              onChange={(event) => {
                setCommunityInput(event.target.value);
                setManualAddError(null);
                setManualAddSuccess(null);
              }}
              placeholder="34550:pubkey:community or naddr..."
              className="min-w-0 flex-1 border border-terminal-dim bg-terminal-bg px-3 py-2 text-xs text-terminal-text font-mono focus:border-terminal-text focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleManualAdd()}
              disabled={isAddingManualCommunity}
              className="inline-flex items-center gap-2 border border-terminal-dim px-3 py-2 text-xs uppercase tracking-wide text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text disabled:opacity-60"
            >
              {isAddingManualCommunity ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              Add
            </button>
          </div>
        </div>
        {manualAddError && <div className="mt-3 text-xs text-terminal-alert">{manualAddError}</div>}
        {manualAddSuccess && (
          <div className="mt-3 flex items-center gap-2 text-xs text-terminal-text">
            <CheckCircle2 size={12} />
            {manualAddSuccess}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <section className="border border-terminal-dim bg-terminal-bg/40 lg:w-[23rem] lg:shrink-0">
          <div className="border-b border-terminal-dim/30 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-terminal-dim">
              Browse by category
            </div>
            <div className="mt-1 text-xs text-terminal-dim/80">
              Categories are inferred from names, descriptions, rules, relay hints, and other Nostr
              metadata.
            </div>
          </div>

          <div className="max-h-[44rem] overflow-y-auto px-4 py-3">
            {isLoadingCommunities && discoveredCommunities.length === 0 && (
              <div className="flex items-center gap-2 py-4 text-sm text-terminal-dim">
                <Loader2 size={14} className="animate-spin" /> Loading communities...
              </div>
            )}

            {communitiesError && (
              <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-3 text-sm text-terminal-alert">
                {communitiesError}
              </div>
            )}

            {!isLoadingCommunities && sections.length === 0 && !communitiesError && (
              <div className="py-4 text-sm text-terminal-dim">
                No communities matched your search on the current relay set.
              </div>
            )}

            <div className="space-y-5">
              {sections.map((section) => (
                <div key={section.id}>
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-terminal-dim">
                    {section.label}
                  </div>
                  <div className="space-y-2">
                    {section.communities
                      .slice(0, visibleCountsBySection[section.id] ?? SECTION_PAGE_SIZE)
                      .map((entry) => {
                        const isSelected = entry.board.id === selectedCommunityId;
                        const isSaved = savedCommunityIds.has(entry.board.id);
                        return (
                          <button
                            key={entry.board.id}
                            type="button"
                            onClick={() => setSelectedCommunityId(entry.board.id)}
                            className={`w-full border px-3 py-3 text-left transition-colors ${
                              isSelected
                                ? 'border-terminal-text bg-terminal-text/10'
                                : 'border-terminal-dim/30 bg-terminal-bg/40 hover:border-terminal-dim hover:bg-terminal-dim/10'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-terminal-text">
                                  {entry.community.name}
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-terminal-dim">
                                  {entry.community.description || 'Moderated Nostr community'}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-terminal-dim/80">
                                  <span>{entry.approvalCount} approved</span>
                                  <span>•</span>
                                  <span>{entry.recentApprovalCount} this week</span>
                                </div>
                              </div>
                              {isSaved && (
                                <Check size={14} className="mt-0.5 shrink-0 text-terminal-text" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                  {(visibleCountsBySection[section.id] ?? SECTION_PAGE_SIZE) <
                    section.communities.length && (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCountsBySection((current) => ({
                          ...current,
                          [section.id]:
                            (current[section.id] ?? SECTION_PAGE_SIZE) + SECTION_PAGE_SIZE,
                        }))
                      }
                      className="mt-2 w-full border border-terminal-dim/30 px-3 py-2 text-xs uppercase tracking-wide text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text"
                    >
                      Show More {section.label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="min-w-0 flex-1 space-y-4">
          {selectedCommunity ? (
            <>
              <div className="overflow-hidden border border-terminal-dim bg-terminal-bg/40">
                <div className="border-b border-terminal-dim/20 bg-gradient-to-r from-terminal-text/10 via-transparent to-terminal-dim/10 px-5 py-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-terminal-dim">
                    Community Preview
                  </div>
                </div>
                <div className="p-5">
                  {selectedCommunity.community.image && (
                    <div className="mb-5 overflow-hidden border border-terminal-dim/30 bg-terminal-bg/60">
                      <img
                        src={selectedCommunity.community.image}
                        alt={selectedCommunity.community.name}
                        className="h-44 w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-2xl font-terminal uppercase tracking-wider text-terminal-text">
                          {selectedCommunity.community.name}
                        </h3>
                        <span className="border border-terminal-dim/40 px-2 py-0.5 text-[11px] uppercase tracking-wide text-terminal-dim">
                          {externalCommunityDiscoveryService.getCategoryLabel(
                            selectedCommunity.category,
                          )}
                        </span>
                        <span className="border border-terminal-dim/40 px-2 py-0.5 text-[11px] uppercase tracking-wide text-terminal-dim">
                          Read Only
                        </span>
                      </div>
                      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-terminal-dim">
                        {selectedCommunity.community.description || 'Moderated Nostr community'}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-wide text-terminal-dim">
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} />
                          {selectedCommunity.board.memberCount} members
                        </span>
                        <span>•</span>
                        <span>{selectedCommunity.community.moderators.length} moderators</span>
                        <span>•</span>
                        <span>{selectedCommunity.community.relays?.length ?? 0} relays</span>
                        <span>•</span>
                        <span>{selectedCommunity.approvalCount} approved posts</span>
                        <span>•</span>
                        <span>{selectedCommunity.recentApprovalCount} approvals this week</span>
                      </div>
                      <div className="mt-2 text-xs uppercase tracking-wide text-terminal-dim/80">
                        {formatRelativeAge(selectedCommunity.latestApprovalAt)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {savedCommunityIds.has(selectedCommunity.board.id) ? (
                        <button
                          type="button"
                          onClick={() => onNavigateToBoard(selectedCommunity.board.id)}
                          className="inline-flex items-center gap-2 border border-terminal-dim px-3 py-2 text-xs uppercase tracking-wide text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text"
                        >
                          <ArrowUpRight size={12} />
                          Open Saved Feed
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleSaveCommunity(selectedCommunity)}
                          disabled={
                            joiningAddress ===
                            (selectedCommunity.community.address || selectedCommunity.board.id)
                          }
                          className="inline-flex items-center gap-2 border border-terminal-text bg-terminal-text px-3 py-2 text-xs font-bold uppercase tracking-wide text-black transition-colors hover:bg-terminal-dim disabled:opacity-60"
                        >
                          {joiningAddress ===
                          (selectedCommunity.community.address || selectedCommunity.board.id) ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          Save To External Communities
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setIsLoadingPreview(true);
                          setPreviewError(null);
                          void externalCommunityDiscoveryService
                            .fetchCommunityPreview(selectedCommunity.board, 8, true)
                            .then((posts) => setPreviewPosts(posts))
                            .catch((error) =>
                              setPreviewError(
                                error instanceof Error
                                  ? error.message
                                  : 'Failed to refresh community preview.',
                              ),
                            )
                            .finally(() => setIsLoadingPreview(false));
                        }}
                        className="inline-flex items-center gap-2 border border-terminal-dim/60 px-3 py-2 text-xs uppercase tracking-wide text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text"
                      >
                        <RefreshCw size={12} className={isLoadingPreview ? 'animate-spin' : ''} />
                        Refresh Posts
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-between border-b border-terminal-dim/30 pb-2">
                <div>
                  <div className="text-sm font-bold uppercase tracking-wide text-terminal-text">
                    Popular Posts
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-terminal-dim">
                    Approved notes available from your current relay set
                  </div>
                </div>
                {relaySummary.partial && (
                  <div className="text-[11px] uppercase tracking-wide text-yellow-400">
                    Partial Results
                  </div>
                )}
              </div>

              {isLoadingPreview && (
                <div className="flex items-center gap-2 border border-terminal-dim bg-terminal-bg/40 p-6 text-sm text-terminal-dim">
                  <Loader2 size={14} className="animate-spin" /> Loading community posts...
                </div>
              )}

              {previewError && (
                <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-4 text-sm text-terminal-alert">
                  {previewError}
                </div>
              )}

              {!isLoadingPreview && !previewError && previewPosts.length === 0 && (
                <div className="border border-terminal-dim bg-terminal-bg/40 p-8 text-center text-terminal-dim">
                  <Radio size={28} className="mx-auto mb-3 opacity-40" />
                  <div className="font-bold uppercase text-terminal-text">
                    No approved posts found yet
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-wide text-terminal-dim">
                    This community exists, but your relays have not returned any approved notes yet.
                  </p>
                </div>
              )}

              {previewPosts.length > 0 && (
                <div className="space-y-3">
                  {previewPosts.map((post) => (
                    <article
                      key={post.id}
                      className="border border-terminal-dim/40 bg-terminal-bg/50 p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-terminal-dim">
                        <span className="font-bold text-terminal-text">
                          {post.score > 0 ? `+${post.score}` : post.score}
                        </span>
                        <span>•</span>
                        <span>{post.author}</span>
                        <span>•</span>
                        <span>{new Date(post.timestamp).toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-base font-bold leading-snug text-terminal-text">
                        {post.title}
                      </h4>
                      <p className="mt-2 text-sm leading-relaxed text-terminal-dim">
                        {post.content}
                      </p>
                      {post.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {post.tags.slice(0, 4).map((tag) => (
                            <span
                              key={`${post.id}-${tag}`}
                              className="border border-terminal-dim/30 px-2 py-0.5 text-[11px] uppercase text-terminal-dim"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 flex items-center justify-between border-t border-terminal-dim/20 pt-3 text-xs uppercase tracking-wide">
                        <span className="text-terminal-dim">Approved Nostr note</span>
                        {onSeedPost && (
                          <button
                            type="button"
                            onClick={() => onSeedPost(post)}
                            className="border border-terminal-dim px-3 py-1 text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text"
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
          ) : (
            <div className="border border-terminal-dim bg-terminal-bg/40 p-8 text-center text-terminal-dim">
              Select a community to inspect its approved posts.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
