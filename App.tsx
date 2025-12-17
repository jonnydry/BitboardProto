import React, { Suspense, lazy, useState, useCallback, useEffect, useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { MAX_DAILY_BITS, INITIAL_POSTS, INITIAL_BOARDS } from './constants';
import { Post, UserState, ViewMode, Board, ThemeId, BoardType, NostrIdentity, SortMode, NOSTR_KINDS } from './types';
import { PostItem } from './components/PostItem';
import { ToastHost } from './components/ToastHost';
import { ArrowLeft } from 'lucide-react';
import { nostrService } from './services/nostrService';
import { identityService } from './services/identityService';
import { votingService } from './services/votingService';
import { bookmarkService } from './services/bookmarkService';
import { reportService } from './services/reportService';
import { makeUniqueBoardId } from './services/boardIdService';
import { toastService } from './services/toastService';
import { encryptedBoardService } from './services/encryptedBoardService';
import { inputValidator } from './services/inputValidator';
import { useInfiniteScroll } from './hooks/useInfiniteScroll';
import { FeatureFlags, StorageKeys, UIConfig } from './config';
import { useTheme } from './hooks/useTheme';
import { useUrlPostRouting } from './hooks/useUrlPostRouting';
import { useNostrFeed } from './hooks/useNostrFeed';
import { useCommentsLoader } from './hooks/useCommentsLoader';
import { useVoting } from './hooks/useVoting';
import { usePostDecryption } from './hooks/usePostDecryption';
import { AppHeader } from './features/layout/AppHeader';
import { Sidebar } from './features/layout/Sidebar';
import { FeedView } from './features/feed/FeedView';

const CreatePost = lazy(() => import('./components/CreatePost').then((m) => ({ default: m.CreatePost })));
const CreateBoard = lazy(() => import('./components/CreateBoard').then((m) => ({ default: m.CreateBoard })));
const IdentityManager = lazy(() => import('./components/IdentityManager').then((m) => ({ default: m.IdentityManager })));
const LocationSelector = lazy(() => import('./components/LocationSelector').then((m) => ({ default: m.LocationSelector })));
const UserProfile = lazy(() => import('./components/UserProfile').then((m) => ({ default: m.UserProfile })));
const Bookmarks = lazy(() => import('./components/Bookmarks').then((m) => ({ default: m.Bookmarks })));
const EditPost = lazy(() => import('./components/EditPost').then((m) => ({ default: m.EditPost })));
const RelaySettings = lazy(() => import('./components/RelaySettings').then((m) => ({ default: m.RelaySettings })));

const MAX_CACHED_POSTS = 200;

function loadCachedPosts(): Post[] | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(StorageKeys.POSTS_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; posts?: unknown };
    if (!parsed || !Array.isArray(parsed.posts)) return null;

    // Basic structural validation; discard obviously malformed entries.
    const posts = (parsed.posts as any[]).filter((p) => p && typeof p.id === 'string' && typeof p.title === 'string');
    return posts as Post[];
  } catch {
    return null;
  }
}

function loadCachedBoards(): Board[] | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(StorageKeys.BOARDS_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; boards?: unknown };
    if (!parsed || !Array.isArray(parsed.boards)) return null;

    const boards = (parsed.boards as any[]).filter((b) => b && typeof b.id === 'string' && typeof b.name === 'string');
    return boards as Board[];
  } catch {
    return null;
  }
}

export default function App() {
  const [posts, setPosts] = useState<Post[]>(() => loadCachedPosts() ?? INITIAL_POSTS);
  const [boards, setBoards] = useState<Board[]>(() => loadCachedBoards() ?? INITIAL_BOARDS);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.FEED);
  const [selectedBitId, setSelectedBitId] = useState<string | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>(ThemeId.AMBER);
  const [isNostrConnected, setIsNostrConnected] = useState(false);
  const [locationBoards, setLocationBoards] = useState<Board[]>([]);
  const [feedFilter, setFeedFilter] = useState<'all' | 'topic' | 'location'>('all');
  
  // New features state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(SortMode.TOP);
  const [profileUser, setProfileUser] = useState<{ username: string; pubkey?: string } | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => bookmarkService.getBookmarkedIds());
  const [reportedPostIds, setReportedPostIds] = useState<string[]>(() =>
    reportService.getReportsByType('post').map(r => r.targetId)
  );

  const getRelayHint = useCallback(() => {
    const connected = nostrService.getConnectedCount();
    const total = nostrService.getRelays().length;
    const state = connected > 0 ? 'Some relays are reachable.' : 'No relays appear reachable.';
    return `${state} Relays: ${connected}/${total}. Open RELAYS to adjust/retry.`;
  }, []);
  
  // Pagination state for infinite scroll
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [oldestTimestamp, setOldestTimestamp] = useState<number | null>(null);
  
  const [userState, setUserState] = useState<UserState>(() => {
    const existingIdentity = identityService.getIdentity();
    return {
      username: existingIdentity?.displayName || 'u/guest_' + Math.floor(Math.random() * 10000).toString(16),
      bits: MAX_DAILY_BITS,
      maxBits: MAX_DAILY_BITS,
      votedPosts: {},
      identity: existingIdentity || undefined,
      hasIdentity: !!existingIdentity,
    };
  });

  // Ensure identity is loaded deterministically (identityService initializes async)
  useEffect(() => {
    let cancelled = false;

    identityService
      .getIdentityAsync()
      .then((identity) => {
        if (cancelled) return;
        if (!identity) return;

        setUserState((prev) => {
          // If user already has an identity in state, don't override it.
          if (prev.hasIdentity || prev.identity) return prev;

          const isGuestHandle = prev.username.startsWith('u/guest_');
          return {
            ...prev,
            identity,
            hasIdentity: true,
            username: identity.displayName && isGuestHandle ? identity.displayName : prev.username,
          };
        });
      })
      .catch((err) => {
        // Non-fatal: app can run in guest mode
        console.warn('[App] Failed to load identity:', err);
        toastService.push({
          type: 'error',
          message: 'Failed to load identity (guest mode)',
          detail: err instanceof Error ? err.message : String(err),
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'identity-load-failed',
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useTheme(theme);
  useUrlPostRouting({ viewMode, selectedBitId, setViewMode, setSelectedBitId });

  // Offline persistence: cache posts/boards to localStorage
  useEffect(() => {
    if (!FeatureFlags.ENABLE_OFFLINE_MODE) return;
    if (typeof localStorage === 'undefined') return;

    const id = window.setTimeout(() => {
      try {
        const postsToStore = posts.slice(0, MAX_CACHED_POSTS);
        localStorage.setItem(
          StorageKeys.POSTS_CACHE,
          JSON.stringify({ savedAt: Date.now(), posts: postsToStore })
        );
        localStorage.setItem(
          StorageKeys.BOARDS_CACHE,
          JSON.stringify({ savedAt: Date.now(), boards })
        );
      } catch {
        // Ignore quota / serialization errors
      }
    }, 500);

    return () => window.clearTimeout(id);
  }, [boards, posts]);

  // Subscribe to bookmark changes
  useEffect(() => {
    const unsubscribe = bookmarkService.subscribe(() => {
      setBookmarkedIds(bookmarkService.getBookmarkedIds());
    });
    return unsubscribe;
  }, []);

  // Subscribe to report changes (posts only)
  useEffect(() => {
    const unsubscribe = reportService.subscribe(() => {
      setReportedPostIds(reportService.getReportsByType('post').map(r => r.targetId));
    });
    return unsubscribe;
  }, []);

  useNostrFeed({ setPosts, setBoards, setIsNostrConnected, setOldestTimestamp, setHasMorePosts });

  // Create boardsById Map for O(1) lookups
  const boardsById = useMemo(() => {
    const map = new Map<string, Board>();
    boards.forEach(b => map.set(b.id, b));
    locationBoards.forEach(b => map.set(b.id, b));
    return map;
  }, [boards, locationBoards]);

  // Create postsById Map for O(1) lookups
  const postsById = useMemo(() => {
    const map = new Map<string, Post>();
    posts.forEach(p => map.set(p.id, p));
    return map;
  }, [posts]);

  useCommentsLoader({ selectedBitId, postsById, setPosts });

  // Filter posts based on view (Global vs Specific Board), feed filter, and search
  const filteredPosts = useMemo(() => {
    let result = posts;
    
    // Filter by board
    if (activeBoardId) {
      result = result.filter(p => p.boardId === activeBoardId);
    } else {
      result = result.filter(p => {
        const board = boardsById.get(p.boardId);
        if (!board?.isPublic) return false;
        
        if (feedFilter === 'topic') return board.type === BoardType.TOPIC;
        if (feedFilter === 'location') return board.type === BoardType.GEOHASH;
        return true;
      });
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((p) => {
        const board = boardsById.get(p.boardId);
        const boardName = board?.name?.toLowerCase() ?? '';

        const inPost =
          p.title.toLowerCase().includes(query) ||
          p.content.toLowerCase().includes(query) ||
          p.author.toLowerCase().includes(query) ||
          boardName.includes(query) ||
          p.tags.some((tag) => tag.toLowerCase().includes(query));

        if (inPost) return true;

        // Also search comments (author + content)
        return p.comments.some(
          (c) =>
            c.author.toLowerCase().includes(query) ||
            c.content.toLowerCase().includes(query)
        );
      });
    }
    
    return result;
  }, [posts, activeBoardId, boardsById, feedFilter, searchQuery]);

  // Decrypt encrypted posts if keys are available
  const decryptedPosts = usePostDecryption(filteredPosts, boardsById);

  // Sort posts based on selected sort mode
  const sortedPosts = useMemo(() => {
    const sorted = [...decryptedPosts];
    
    switch (sortMode) {
      case SortMode.NEWEST:
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case SortMode.OLDEST:
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case SortMode.TRENDING: {
        // Trending = recent posts with high engagement (score + comments weighted by recency)
        const now = Date.now();
        const HOUR = 1000 * 60 * 60;
        return sorted.sort((a, b) => {
          const ageA = (now - a.timestamp) / HOUR;
          const ageB = (now - b.timestamp) / HOUR;
          const trendA = (a.score + a.commentCount * 2) / Math.pow(ageA + 2, 1.5);
          const trendB = (b.score + b.commentCount * 2) / Math.pow(ageB + 2, 1.5);
          return trendB - trendA;
        });
      }
      case SortMode.COMMENTS:
        return sorted.sort((a, b) => b.commentCount - a.commentCount);
      case SortMode.TOP:
      default:
        return sorted.sort((a, b) => b.score - a.score);
    }
  }, [decryptedPosts, sortMode]);

  // Collect known usernames for @mention autocomplete
  const knownUsers = useMemo(() => {
    const users = new Set<string>();
    posts.forEach(post => {
      users.add(post.author);
      post.comments.forEach(comment => {
        users.add(comment.author);
      });
    });
    return users;
  }, [posts]);

  // Find selected post for single view
  const selectedPost = useMemo(() => {
    return selectedBitId ? postsById.get(selectedBitId) || null : null;
  }, [selectedBitId, postsById]);
  
  // Find active board object
  const activeBoard = useMemo(() => {
    return activeBoardId ? boardsById.get(activeBoardId) : null;
  }, [activeBoardId, boardsById]);

  // Split boards by type
  const topicBoards = useMemo(() => {
    return boards.filter(b => b.type === BoardType.TOPIC);
  }, [boards]);

  // Deduplicate geohash boards: combine boards from state and locationBoards, removing duplicates by id
  const geohashBoards = useMemo(() => {
    const geohashBoardsFromState = boards.filter(b => b.type === BoardType.GEOHASH);
    const geohashBoardsMap = new Map<string, Board>();
    // Add boards from state first
    geohashBoardsFromState.forEach(b => geohashBoardsMap.set(b.id, b));
    // Add location boards, which will overwrite duplicates (locationBoards take precedence)
    locationBoards.forEach(b => geohashBoardsMap.set(b.id, b));
    return Array.from(geohashBoardsMap.values());
  }, [boards, locationBoards]);

  const { handleVote } = useVoting({ postsById, userState, setUserState, setPosts });

  const handleCreatePost = async (
    newPostData: Omit<Post, 'id' | 'timestamp' | 'score' | 'commentCount' | 'comments' | 'nostrEventId' | 'upvotes' | 'downvotes'>
  ) => {
    const timestamp = Date.now();

    const newPost: Post = {
      ...newPostData,
      id: `local-${Date.now()}`,
      timestamp,
      score: 1,
      commentCount: 0,
      comments: [],
      upvotes: 1,
      downvotes: 0,
    };

    // Publish to Nostr if identity exists
    if (userState.identity) {
      try {
        // Check if posting to a geohash board and include the geohash
        const targetBoard = boardsById.get(newPostData.boardId);
        const geohash = targetBoard?.type === BoardType.GEOHASH ? targetBoard.geohash : undefined;
        const boardAddress =
          targetBoard?.createdBy
            ? `${NOSTR_KINDS.BOARD_DEFINITION}:${targetBoard.createdBy}:${targetBoard.id}`
            : undefined;
        
        // Check if board is encrypted and encrypt content if needed
        let encryptedTitle: string | undefined;
        let encryptedContent: string | undefined;
        
        if (targetBoard?.isEncrypted) {
          const boardKey = encryptedBoardService.getBoardKey(targetBoard.id);
          if (!boardKey) {
            toastService.push({
              type: 'error',
              message: 'Encryption key not found',
              detail: 'You need the board share link to post in this encrypted board.',
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: 'encryption-key-missing',
            });
            return; // Abort post creation
          }
          
          try {
            const encrypted = await encryptedBoardService.encryptPost(
              { title: newPostData.title, content: newPostData.content },
              boardKey
            );
            encryptedTitle = encrypted.encryptedTitle;
            encryptedContent = encrypted.encryptedContent;
            newPost.isEncrypted = true;
            newPost.encryptedTitle = encryptedTitle;
            newPost.encryptedContent = encryptedContent;
          } catch (error) {
            console.error('[App] Failed to encrypt post:', error);
            toastService.push({
              type: 'error',
              message: 'Failed to encrypt post',
              detail: error instanceof Error ? error.message : String(error),
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: 'encryption-failed',
            });
            return; // Abort post creation
          }
        }
        
        const eventPayload = {
          ...newPostData,
          timestamp,
          upvotes: 0,
          downvotes: 0,
        };

        const unsigned = nostrService.buildPostEvent(eventPayload, userState.identity.pubkey, geohash, {
          boardAddress,
          boardName: targetBoard?.name,
          encryptedTitle,
          encryptedContent,
        });
        const signed = await identityService.signEvent(unsigned);
        const event = await nostrService.publishSignedEvent(signed);
        newPost.nostrEventId = event.id;
        newPost.id = event.id;
      } catch (error) {
        console.error('[App] Failed to publish post to Nostr:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        toastService.push({
          type: 'error',
          message: 'Failed to publish post to Nostr (saved locally)',
          detail: `${errMsg} — ${getRelayHint()}`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'publish-post-failed',
        });
      }
    }

    setPosts(prev => [newPost, ...prev]);
    setViewMode(ViewMode.FEED);
  };

  const handleCreateBoard = async (newBoardData: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>) => {
    const existingIds = new Set<string>([...boards, ...locationBoards].map(b => b.id));
    const id = makeUniqueBoardId(newBoardData.name, existingIds);

    const newBoard: Board = {
      ...newBoardData,
      id,
      memberCount: 1,
      createdBy: userState.identity?.pubkey,
    };

    // Publish to Nostr if identity exists
    if (userState.identity) {
      try {
        const unsigned = nostrService.buildBoardEvent(newBoard, userState.identity.pubkey);
        const signed = await identityService.signEvent(unsigned);
        const event = await nostrService.publishSignedEvent(signed);
        newBoard.nostrEventId = event.id;
      } catch (error) {
        console.error('[App] Failed to publish board to Nostr:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        toastService.push({
          type: 'error',
          message: 'Failed to publish board to Nostr (saved locally)',
          detail: `${errMsg} — ${getRelayHint()}`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'publish-board-failed',
        });
      }
    }

    setBoards(prev => [...prev, newBoard]);
    setActiveBoardId(newBoard.id);
    setViewMode(ViewMode.FEED);
  };

  const handleComment = useCallback(async (postId: string, content: string, parentCommentId?: string) => {
    const post = postsById.get(postId);
    if (!post) return;
    
    // Check if post's board is encrypted
    const board = boardsById.get(post.boardId);
    let encryptedContent: string | undefined;
    
    if (board?.isEncrypted) {
      const boardKey = encryptedBoardService.getBoardKey(board.id);
      if (!boardKey) {
        toastService.push({
          type: 'error',
          message: 'Encryption key not found',
          detail: 'You need the board share link to comment in this encrypted board.',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'encryption-key-missing-comment',
        });
        return; // Abort comment creation
      }
      
      try {
        encryptedContent = await encryptedBoardService.encryptContent(content, boardKey);
      } catch (error) {
        console.error('[App] Failed to encrypt comment:', error);
        toastService.push({
          type: 'error',
          message: 'Failed to encrypt comment',
          detail: error instanceof Error ? error.message : String(error),
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'encryption-failed-comment',
        });
        return; // Abort comment creation
      }
    }
    
    const newComment = {
      id: `c-${Date.now()}`,
      author: userState.username,
      authorPubkey: userState.identity?.pubkey,
      content: content,
      timestamp: Date.now(),
      parentId: parentCommentId, // For threaded comments
      isEncrypted: !!encryptedContent,
      encryptedContent,
    };

    // Publish to Nostr if connected
    if (userState.identity && post.nostrEventId) {
      const parentComment = parentCommentId ? post.comments.find(c => c.id === parentCommentId) : undefined;
      const unsigned = nostrService.buildCommentEvent(
        post.nostrEventId,
        content,
        userState.identity.pubkey,
        parentCommentId,
        {
          postAuthorPubkey: post.authorPubkey,
          parentCommentAuthorPubkey: parentComment?.authorPubkey,
          encryptedContent,
        }
      );
      identityService.signEvent(unsigned)
        .then(signed => nostrService.publishSignedEvent(signed))
        .then(event => {
          setPosts(prevPosts =>
            prevPosts.map(p => {
              if (p.id === postId) {
                const updatedComment = { ...newComment, id: event.id, nostrEventId: event.id };
                return {
                  ...p,
                  comments: p.comments.map(c => c.id === newComment.id ? updatedComment : c)
                };
              }
              return p;
            })
          );
        })
        .catch(error => {
          console.error('[App] Failed to publish comment to Nostr:', error);
          const errMsg = error instanceof Error ? error.message : String(error);
          toastService.push({
            type: 'error',
            message: 'Failed to publish comment to Nostr (saved locally)',
            detail: `${errMsg} — ${getRelayHint()}`,
            durationMs: UIConfig.TOAST_DURATION_MS,
            dedupeKey: 'publish-comment-failed',
          });
        });
    }

    setPosts(currentPosts => 
      currentPosts.map(p => {
        if (p.id === postId) {
          return {
            ...p,
            commentCount: p.commentCount + 1,
            comments: [...p.comments, newComment]
          };
        }
        return p;
      })
    );
  }, [postsById, userState.username, userState.identity, getRelayHint]);

  const handleEditComment = useCallback(async (postId: string, commentId: string, nextContent: string) => {
    const validated = inputValidator.validateCommentContent(nextContent);
    if (!validated) {
      toastService.push({
        type: 'error',
        message: 'Invalid comment content',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'comment-edit-invalid',
      });
      return;
    }

    const post = postsById.get(postId);
    const target = post?.comments.find((c) => c.id === commentId);
    if (!post || !target) return;

    // Update locally immediately
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          comments: p.comments.map((c) =>
            c.id === commentId ? { ...c, content: validated, editedAt: Date.now() } : c
          ),
        };
      })
    );

    // Publish comment edit companion event if possible
    if (userState.identity && post.nostrEventId && target.nostrEventId && target.authorPubkey === userState.identity.pubkey) {
      try {
        // Check if board is encrypted and encrypt content if needed
        const board = boardsById.get(post.boardId);
        let encryptedContent: string | undefined;
        
        if (board?.isEncrypted) {
          const boardKey = encryptedBoardService.getBoardKey(board.id);
          if (!boardKey) {
            toastService.push({
              type: 'error',
              message: 'Encryption key not found',
              detail: 'You need the board share link to edit comments in this encrypted board.',
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: 'encryption-key-missing-comment-edit',
            });
            return;
          }
          
          try {
            encryptedContent = await encryptedBoardService.encryptContent(validated, boardKey);
          } catch (error) {
            console.error('[App] Failed to encrypt comment edit:', error);
            toastService.push({
              type: 'error',
              message: 'Failed to encrypt comment edit',
              detail: error instanceof Error ? error.message : String(error),
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: 'encryption-failed-comment-edit',
            });
            return;
          }
        }
        
        const unsigned = nostrService.buildCommentEditEvent({
          rootPostEventId: post.nostrEventId,
          targetCommentEventId: target.nostrEventId,
          content: validated,
          pubkey: userState.identity.pubkey,
          encryptedContent,
        });
        const signed = await identityService.signEvent(unsigned);
        await nostrService.publishSignedEvent(signed);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        toastService.push({
          type: 'error',
          message: 'Failed to publish comment edit to Nostr (saved locally)',
          detail: `${errMsg} — ${getRelayHint()}`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `comment-edit-failed-${commentId}`,
        });
      }
    }
  }, [getRelayHint, postsById, boardsById, userState.identity]);

  const handleDeleteComment = useCallback(async (postId: string, commentId: string) => {
    const post = postsById.get(postId);
    const target = post?.comments.find((c) => c.id === commentId);
    if (!post || !target) return;

    // Mark as deleted locally (preserves thread structure)
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          comments: p.comments.map((c) =>
            c.id === commentId
              ? { ...c, isDeleted: true, deletedAt: Date.now(), content: '[deleted]', author: '[deleted]', authorPubkey: undefined }
              : c
          ),
        };
      })
    );

    // Publish NIP-09 delete event if possible
    if (userState.identity && post.nostrEventId && target.nostrEventId && target.authorPubkey === userState.identity.pubkey) {
      try {
        const unsigned = nostrService.buildCommentDeleteEvent({
          rootPostEventId: post.nostrEventId,
          targetCommentEventId: target.nostrEventId,
          pubkey: userState.identity.pubkey,
        });
        const signed = await identityService.signEvent(unsigned);
        await nostrService.publishSignedEvent(signed);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        toastService.push({
          type: 'error',
          message: 'Failed to publish comment delete to Nostr (deleted locally)',
          detail: `${errMsg} — ${getRelayHint()}`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `comment-delete-failed-${commentId}`,
        });
      }
    }
  }, [getRelayHint, postsById, boardsById, userState.identity]);

  const handleViewBit = useCallback((postId: string) => {
    setSelectedBitId(postId);
    setViewMode(ViewMode.SINGLE_BIT);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToBoard = useCallback((boardId: string | null) => {
    setActiveBoardId(boardId);
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  }, []);

  const returnToFeed = () => {
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  };

  const handleIdentityChange = (identity: NostrIdentity | null) => {
    setUserState(prev => ({
      ...prev,
      identity: identity || undefined,
      username: identity?.displayName || prev.username,
      hasIdentity: !!identity,
    }));
  };

  const handleLocationBoardSelect = (board: Board) => {
    // Add to location boards if not already present
    setLocationBoards(prev => {
      if (prev.some(b => b.id === board.id)) return prev;
      return [...prev, board];
    });
    setActiveBoardId(board.id);
    setViewMode(ViewMode.FEED);
  };

  // Handle viewing a user's profile
  const handleViewProfile = useCallback((username: string, pubkey?: string) => {
    setProfileUser({ username, pubkey });
    setViewMode(ViewMode.USER_PROFILE);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle editing a post
  const handleEditPost = useCallback((postId: string) => {
    setEditingPostId(postId);
    setViewMode(ViewMode.EDIT_POST);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle saving edited post
  const handleSavePost = useCallback(
    (postId: string, updates: Partial<Post>) => {
      const existing = postsById.get(postId);
      if (!existing) return;

      const merged: Post = { ...existing, ...updates };

      // Update local state immediately (works for offline + fast UI)
      setPosts((currentPosts) =>
        currentPosts.map((p) => (p.id === postId ? { ...p, ...updates } : p))
      );
      setEditingPostId(null);
      setViewMode(ViewMode.FEED);

      // If this post is on Nostr and we have an identity, publish an edit companion event.
      if (existing.nostrEventId && userState.identity) {
        (async () => {
          try {
            // Check if board is encrypted and encrypt content if needed
            const board = boardsById.get(existing.boardId);
            let encryptedTitle: string | undefined;
            let encryptedContent: string | undefined;
            
            if (board?.isEncrypted) {
              const boardKey = encryptedBoardService.getBoardKey(board.id);
              if (!boardKey) {
                toastService.push({
                  type: 'error',
                  message: 'Encryption key not found',
                  detail: 'You need the board share link to edit posts in this encrypted board.',
                  durationMs: UIConfig.TOAST_DURATION_MS,
                  dedupeKey: 'encryption-key-missing-edit',
                });
                return;
              }
              
              try {
                const encrypted = await encryptedBoardService.encryptPost(
                  { title: merged.title, content: merged.content },
                  boardKey
                );
                encryptedTitle = encrypted.encryptedTitle;
                encryptedContent = encrypted.encryptedContent;
              } catch (error) {
                console.error('[App] Failed to encrypt post edit:', error);
                toastService.push({
                  type: 'error',
                  message: 'Failed to encrypt post edit',
                  detail: error instanceof Error ? error.message : String(error),
                  durationMs: UIConfig.TOAST_DURATION_MS,
                  dedupeKey: 'encryption-failed-edit',
                });
                return;
              }
            }
            
            const unsigned = nostrService.buildPostEditEvent({
              rootPostEventId: existing.nostrEventId,
              boardId: existing.boardId,
              title: merged.title,
              content: merged.content,
              tags: merged.tags,
              url: merged.url,
              imageUrl: merged.imageUrl,
              pubkey: userState.identity!.pubkey,
              encryptedTitle,
              encryptedContent,
            });

            const signed = await identityService.signEvent(unsigned);
            await nostrService.publishSignedEvent(signed);

            toastService.push({
              type: 'success',
              message: 'Edit published to Nostr',
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: `post-edit-published-${existing.nostrEventId}`,
            });
          } catch (error) {
            console.error('[App] Failed to publish post edit to Nostr:', error);
            const errMsg = error instanceof Error ? error.message : String(error);
            toastService.push({
              type: 'error',
              message: 'Failed to publish edit to Nostr (saved locally)',
              detail: `${errMsg} — ${getRelayHint()}`,
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: `post-edit-failed-${existing.nostrEventId}`,
            });
          }
        })();
      } else if (existing.nostrEventId && !userState.identity) {
        toastService.push({
          type: 'info',
          message: 'Edit saved locally. Connect an identity to publish to Nostr.',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `post-edit-local-only-${existing.nostrEventId}`,
        });
      }
    },
    [postsById, boardsById, userState.identity, getRelayHint]
  );

  // Handle deleting a post
  const handleDeletePost = useCallback((postId: string) => {
    setPosts(currentPosts => currentPosts.filter(p => p.id !== postId));
    // Also remove from bookmarks if bookmarked
    bookmarkService.removeBookmark(postId);
    setEditingPostId(null);
    setViewMode(ViewMode.FEED);
  }, []);

  // Handle tag click (search by tag)
  const handleTagClick = useCallback((tag: string) => {
    setSearchQuery(tag);
    setActiveBoardId(null);
    setViewMode(ViewMode.FEED);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle search
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Load more posts for infinite scroll
  const loadMorePosts = useCallback(async () => {
    if (!oldestTimestamp || !hasMorePosts) return;

    try {
      // Fetch posts older than the current oldest
      const loadMoreLimit = UIConfig.POSTS_LOAD_MORE_COUNT;
      const olderPosts = await nostrService.fetchPosts({
        limit: loadMoreLimit,
        until: Math.floor(oldestTimestamp / 1000) - 1, // Convert to seconds, get older posts
      });

      if (olderPosts.length > 0) {
        const convertedPosts = olderPosts.map(event => nostrService.eventToPost(event));
        
        // Fetch votes for new posts
        const postsWithNostrIds = convertedPosts.filter(p => p.nostrEventId);
        const postIds = postsWithNostrIds.map(p => p.nostrEventId!);
        const voteTallies = await votingService.fetchVotesForPosts(postIds);
        
        const postsWithVotes = convertedPosts.map((post) => {
          if (post.nostrEventId) {
            const tally = voteTallies.get(post.nostrEventId);
            if (tally) {
              return {
                ...post,
                upvotes: tally.upvotes,
                downvotes: tally.downvotes,
                score: tally.score,
                uniqueVoters: tally.uniqueVoters,
                votesVerified: true,
              };
            }
          }
          return post;
        });

        // Fetch and apply latest post edits
        try {
          const editEvents = await nostrService.fetchPostEdits(postIds, { limit: 300 });
          if (editEvents.length > 0) {
            const latestByRoot = new Map<string, { created_at: number; event: NostrEvent }>();
            for (const ev of editEvents) {
              const parsed = nostrService.eventToPostEditUpdate(ev);
              if (!parsed) continue;
              const existing = latestByRoot.get(parsed.rootPostEventId);
              if (!existing || ev.created_at > existing.created_at) {
                latestByRoot.set(parsed.rootPostEventId, { created_at: ev.created_at, event: ev });
              }
            }

            for (let i = 0; i < postsWithVotes.length; i++) {
              const p = postsWithVotes[i];
              const rootId = p.nostrEventId;
              if (!rootId) continue;
              const latest = latestByRoot.get(rootId);
              if (!latest) continue;
              const parsed = nostrService.eventToPostEditUpdate(latest.event);
              if (!parsed) continue;
              postsWithVotes[i] = { ...p, ...parsed.updates };
            }
          }
        } catch (err) {
          console.warn('[App] Failed to fetch post edits for pagination:', err);
        }

        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.nostrEventId).filter(Boolean));
          const newPosts = postsWithVotes.filter(p => !existingIds.has(p.nostrEventId));
          return [...prev, ...newPosts];
        });

        // Update oldest timestamp
        const timestamps = postsWithVotes.map(p => p.timestamp);
        if (timestamps.length > 0) {
          setOldestTimestamp(Math.min(...timestamps));
        }

        // Check if there might be more
        setHasMorePosts(olderPosts.length >= loadMoreLimit);
      } else {
        setHasMorePosts(false);
      }
    } catch (error) {
      console.error('[App] Failed to load more posts:', error);
      toastService.push({
        type: 'error',
        message: 'Failed to load more posts',
        detail: error instanceof Error ? error.message : String(error),
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'load-more-failed',
      });
    }
  }, [oldestTimestamp, hasMorePosts]);

  // Infinite scroll hook
  const { loaderRef, isLoading: isLoadingMore } = useInfiniteScroll(
    loadMorePosts,
    hasMorePosts && viewMode === ViewMode.FEED,
    { threshold: 300 }
  );

  // Memoize theme colors map
  const themeColors = useMemo(() => {
    return new Map<ThemeId, string>([
      [ThemeId.AMBER, '#ffb000'],
      [ThemeId.PHOSPHOR, '#00ff41'],
      [ThemeId.PLASMA, '#00f0ff'],
      [ThemeId.VERMILION, '#ff4646'],
      [ThemeId.SLATE, '#c8c8c8'],
      [ThemeId.PATRIOT, '#ffffff'],
      [ThemeId.SAKURA, '#ffb4dc'],
      [ThemeId.BITBORING, '#ffffff'],
    ]);
  }, []);

  const getThemeColor = useCallback((id: ThemeId) => {
    return themeColors.get(id) || '#fff';
  }, [themeColors]);

  // Helper function to get board name
  const getBoardName = useCallback((postId: string) => {
    const post = postsById.get(postId);
    if (!post) return undefined;
    const board = boardsById.get(post.boardId);
    return board?.name;
  }, [postsById, boardsById]);

  const bookmarkedIdSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);
  const reportedPostIdSet = useMemo(() => new Set(reportedPostIds), [reportedPostIds]);

  const refreshProfileMetadata = useCallback(async (pubkeys: string[]) => {
    const unique = Array.from(new Set(pubkeys.filter(Boolean)));
    if (unique.length === 0) return;

    try {
      await nostrService.fetchProfiles(unique, { force: true });

      // Update display names across posts + comments
      setPosts((prev) =>
        prev.map((p) => {
          const nextAuthor =
            p.authorPubkey && unique.includes(p.authorPubkey)
              ? nostrService.getDisplayName(p.authorPubkey)
              : p.author;

          const nextComments = p.comments.map((c) => {
            if (!c.authorPubkey) return c;
            if (!unique.includes(c.authorPubkey)) return c;
            return { ...c, author: nostrService.getDisplayName(c.authorPubkey) };
          });

          return {
            ...p,
            author: nextAuthor,
            comments: nextComments,
          };
        })
      );

      toastService.push({
        type: 'success',
        message: 'Profile refreshed',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: `profile-refresh-${unique.join(',')}`,
      });
    } catch (error) {
      toastService.push({
        type: 'error',
        message: 'Failed to refresh profile',
        detail: error instanceof Error ? error.message : String(error),
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: `profile-refresh-failed-${unique.join(',')}`,
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono selection:bg-terminal-text selection:text-black relative">
      <ToastHost />
      {/* Scanline Overlay */}
      <div className="scanlines fixed inset-0 pointer-events-none z-50"></div>

      <div className="max-w-[1074px] mx-auto p-4 md:p-6 relative z-10">
        <AppHeader
          theme={theme}
          isNostrConnected={isNostrConnected}
          viewMode={viewMode}
          activeBoardId={activeBoardId}
          bookmarkedCount={bookmarkedIds.length}
          identity={userState.identity || undefined}
          onNavigateGlobal={() => navigateToBoard(null)}
          onSetViewMode={setViewMode}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 py-[5px]">
          {/* Main Content */}
          <main className="md:col-span-3">
            <Suspense
              fallback={
                <div className="border border-terminal-dim p-6 bg-terminal-bg shadow-hard text-terminal-dim uppercase text-sm">
                  Loading…
                </div>
              }
            >
            {viewMode === ViewMode.FEED && (
              <FeedView
                sortedPosts={sortedPosts}
                searchQuery={searchQuery}
                sortMode={sortMode}
                setSortMode={setSortMode}
                activeBoard={activeBoard}
                viewMode={viewMode}
                onSetViewMode={setViewMode}
                onSearch={handleSearch}
                getBoardName={getBoardName}
                userState={userState}
                knownUsers={knownUsers}
                onVote={handleVote}
                onComment={handleComment}
                onEditComment={handleEditComment}
                onDeleteComment={handleDeleteComment}
                onViewBit={handleViewBit}
                onViewProfile={handleViewProfile}
                onEditPost={handleEditPost}
                onTagClick={handleTagClick}
                bookmarkedIdSet={bookmarkedIdSet}
                reportedPostIdSet={reportedPostIdSet}
                onToggleBookmark={(id) => bookmarkService.toggleBookmark(id)}
                isNostrConnected={isNostrConnected}
                loaderRef={loaderRef}
                isLoadingMore={isLoadingMore}
                hasMorePosts={hasMorePosts}
              />
            )}

            {viewMode === ViewMode.SINGLE_BIT && selectedPost && (
              <div className="animate-fade-in">
                <button 
                  onClick={returnToFeed}
                  className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-sm font-bold group"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  BACK TO {activeBoard ? (activeBoard.type === BoardType.GEOHASH ? `#${activeBoard.geohash}` : `//${activeBoard.name}`) : 'GLOBAL'}
                </button>

                <div className="border-t border-terminal-dim/30 pt-2">
                  <PostItem 
                    post={selectedPost} 
                    boardName={selectedPost ? getBoardName(selectedPost.id) : undefined}
                    userState={userState}
                    knownUsers={knownUsers}
                    onVote={handleVote}
                    onComment={handleComment}
                    onEditComment={handleEditComment}
                    onDeleteComment={handleDeleteComment}
                    onViewBit={() => {}}
                    onViewProfile={handleViewProfile}
                    onEditPost={handleEditPost}
                    onTagClick={handleTagClick}
                    isBookmarked={bookmarkedIdSet.has(selectedPost.id)}
                    onToggleBookmark={(id) => bookmarkService.toggleBookmark(id)}
                    hasReported={reportedPostIdSet.has(selectedPost.id)}
                    isFullPage={true}
                    isNostrConnected={isNostrConnected}
                  />
                </div>
              </div>
            )}

            {viewMode === ViewMode.CREATE && (
              <CreatePost 
                availableBoards={[...boards.filter(b => b.isPublic), ...locationBoards]}
                currentBoardId={activeBoardId}
                activeUser={userState.username}
                userPubkey={userState.identity?.pubkey}
                onSubmit={handleCreatePost} 
                onCancel={returnToFeed} 
              />
            )}

            {viewMode === ViewMode.CREATE_BOARD && (
              <CreateBoard
                onSubmit={handleCreateBoard}
                onCancel={returnToFeed}
                identity={userState.identity}
                onConnectIdentity={() => setViewMode(ViewMode.IDENTITY)}
              />
            )}

            {viewMode === ViewMode.IDENTITY && (
              <IdentityManager
                onIdentityChange={handleIdentityChange}
                onClose={returnToFeed}
              />
            )}

            {viewMode === ViewMode.RELAYS && (
              <RelaySettings onClose={returnToFeed} />
            )}

            {viewMode === ViewMode.LOCATION && (
              <LocationSelector
                onSelectBoard={handleLocationBoardSelect}
                onClose={returnToFeed}
              />
            )}

            {viewMode === ViewMode.USER_PROFILE && profileUser && (
              <UserProfile
                username={profileUser.username}
                authorPubkey={profileUser.pubkey}
                posts={posts}
                bookmarkedIdSet={bookmarkedIdSet}
                reportedPostIdSet={reportedPostIdSet}
                onToggleBookmark={(id) => bookmarkService.toggleBookmark(id)}
                userState={userState}
                onVote={handleVote}
                onComment={handleComment}
                onViewBit={handleViewBit}
                onRefreshProfile={(pubkey) => refreshProfileMetadata([pubkey])}
                onClose={returnToFeed}
                isNostrConnected={isNostrConnected}
              />
            )}

            {viewMode === ViewMode.BOOKMARKS && (
              <Bookmarks
                posts={posts}
                bookmarkedIds={bookmarkedIds}
                reportedPostIdSet={reportedPostIdSet}
                userState={userState}
                onVote={handleVote}
                onComment={handleComment}
                onViewBit={handleViewBit}
                onClose={returnToFeed}
                isNostrConnected={isNostrConnected}
              />
            )}

            {viewMode === ViewMode.EDIT_POST && editingPostId && (
              <EditPost
                post={postsById.get(editingPostId)!}
                boards={[...boards, ...locationBoards]}
                onSave={handleSavePost}
                onDelete={handleDeletePost}
                onCancel={returnToFeed}
              />
            )}
            </Suspense>
          </main>

          <Sidebar
            userState={userState}
            setUserState={setUserState}
            theme={theme}
            setTheme={setTheme}
            getThemeColor={getThemeColor}
            isNostrConnected={isNostrConnected}
            viewMode={viewMode}
            activeBoardId={activeBoardId}
            feedFilter={feedFilter}
            setFeedFilter={setFeedFilter}
            topicBoards={topicBoards}
            geohashBoards={geohashBoards}
            navigateToBoard={navigateToBoard}
            onSetViewMode={setViewMode}
          />
        </div>
      </div>
      
      {/* Footer */}
      <footer className="text-center text-terminal-dim text-xs py-8 opacity-50">
        BitBoard NOSTR PROTOCOL V3.0 // RELAYS: {nostrService.getRelays().length} // NODES ACTIVE: {boards.length + locationBoards.length}
      </footer>
    </div>
  );
}
