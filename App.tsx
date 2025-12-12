import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { MAX_DAILY_BITS, INITIAL_POSTS, INITIAL_BOARDS } from './constants';
import { Post, UserState, ViewMode, Board, ThemeId, BoardType, NostrIdentity, SortMode } from './types';
import { PostItem } from './components/PostItem';
import { BitStatus } from './components/BitStatus';
import { CreatePost } from './components/CreatePost';
import { CreateBoard } from './components/CreateBoard';
import { IdentityManager } from './components/IdentityManager';
import { LocationSelector } from './components/LocationSelector';
import { SearchBar } from './components/SearchBar';
import { SortSelector } from './components/SortSelector';
import { UserProfile } from './components/UserProfile';
import { Bookmarks } from './components/Bookmarks';
import { EditPost } from './components/EditPost';
import { Terminal, HelpCircle, ArrowLeft, Hash, Lock, Globe, Eye, Key, MapPin, Wifi, WifiOff, Radio, Bookmark } from 'lucide-react';
import { nostrService } from './services/nostrService';
import { identityService } from './services/identityService';
import { geohashService } from './services/geohashService';
import { votingService, computeOptimisticUpdate, computeRollback } from './services/votingService';
import { bookmarkService } from './services/bookmarkService';
import { useInfiniteScroll } from './hooks/useInfiniteScroll';
import { UIConfig } from './config';

export default function App() {
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [boards, setBoards] = useState<Board[]>(INITIAL_BOARDS);
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

  // Apply theme to body
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Handle URL routing for direct post links
  useEffect(() => {
    const handleUrlNavigation = () => {
      const params = new URLSearchParams(window.location.search);
      const postId = params.get('post');
      
      if (postId) {
        // Navigate to the post
        setSelectedBitId(postId);
        setViewMode(ViewMode.SINGLE_BIT);
      }
    };

    // Check on initial load
    handleUrlNavigation();

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', handleUrlNavigation);
    return () => window.removeEventListener('popstate', handleUrlNavigation);
  }, []);

  // Update URL when viewing a single post
  useEffect(() => {
    if (viewMode === ViewMode.SINGLE_BIT && selectedBitId) {
      const url = new URL(window.location.href);
      url.searchParams.set('post', selectedBitId);
      window.history.pushState({ postId: selectedBitId }, '', url.toString());
    } else if (viewMode === ViewMode.FEED) {
      // Clear post param when returning to feed
      const url = new URL(window.location.href);
      if (url.searchParams.has('post')) {
        url.searchParams.delete('post');
        window.history.pushState({}, '', url.toString());
      }
    }
  }, [viewMode, selectedBitId]);

  // Subscribe to bookmark changes
  useEffect(() => {
    const unsubscribe = bookmarkService.subscribe(() => {
      setBookmarkedIds(bookmarkService.getBookmarkedIds());
    });
    return unsubscribe;
  }, []);

  // Initialize Nostr connection and fetch posts
  useEffect(() => {
    const initNostr = async () => {
      try {
        // Fetch initial batch of posts from Nostr
        const initialLimit = UIConfig.INITIAL_POSTS_COUNT;
        const nostrPosts = await nostrService.fetchPosts({ limit: initialLimit });
        
        if (nostrPosts.length > 0) {
          const convertedPosts = nostrPosts.map(event => nostrService.eventToPost(event));
          
          // Batch fetch cryptographically verified votes for all posts
          // Uses votingService to ensure one vote per pubkey (equal influence)
          const postsWithNostrIds = convertedPosts.filter(p => p.nostrEventId);
          const postIds = postsWithNostrIds.map(p => p.nostrEventId!);
          
          // Batch fetch votes (more efficient than individual requests)
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

          setPosts(prev => {
            // Merge Nostr posts with initial posts, avoiding duplicates
            const existingIds = new Set(prev.map(p => p.nostrEventId).filter(Boolean));
            const newPosts = postsWithVotes.filter(p => !existingIds.has(p.nostrEventId));
            return [...prev, ...newPosts];
          });

          // Track oldest timestamp for pagination
          const timestamps = postsWithVotes.map(p => p.timestamp);
          if (timestamps.length > 0) {
            setOldestTimestamp(Math.min(...timestamps));
          }

          // Check if there might be more posts
          setHasMorePosts(nostrPosts.length >= initialLimit);
        } else {
          setHasMorePosts(false);
        }

        // Fetch boards from Nostr
        const nostrBoards = await nostrService.fetchBoards();
        if (nostrBoards.length > 0) {
          const convertedBoards = nostrBoards.map(event => nostrService.eventToBoard(event));
          setBoards(prev => {
            const existingIds = new Set(prev.map(b => b.id));
            const newBoards = convertedBoards.filter(b => !existingIds.has(b.id));
            return [...prev, ...newBoards];
          });
        }

        setIsNostrConnected(true);
      } catch (error) {
        console.error('[App] Failed to initialize Nostr:', error);
        setIsNostrConnected(false);
      }
    };

    initNostr();

    // Subscribe to real-time updates
    const subId = nostrService.subscribeToFeed((event) => {
      const post = nostrService.eventToPost(event);
      setPosts(prev => {
        if (prev.some(p => p.nostrEventId === post.nostrEventId)) return prev;
        return [post, ...prev];
      });
    });

    return () => {
      nostrService.unsubscribe(subId);
    };
  }, []);

  // Cleanup on unmount and beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      nostrService.cleanup();
      votingService.cleanup();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cleanup subscriptions and caches on app shutdown
      nostrService.cleanup();
      votingService.cleanup();
    };
  }, []);

  // Fetch comments when viewing a single post
  useEffect(() => {
    const fetchCommentsForPost = async () => {
      if (!selectedBitId) return;
      
      // Find post inside effect to avoid dependency on posts array
      setPosts(currentPosts => {
        const post = currentPosts.find(p => p.id === selectedBitId);
        if (!post?.nostrEventId) return currentPosts;
        
        // Only fetch if post has no comments loaded yet
        if (post.comments.length > 0) return currentPosts;
        
        // Fetch comments asynchronously
        nostrService.fetchComments(post.nostrEventId)
          .then(commentEvents => {
            if (commentEvents.length > 0) {
              const comments = commentEvents.map(event => nostrService.eventToComment(event));
              setPosts(prevPosts =>
                prevPosts.map(p => {
                  if (p.id === selectedBitId) {
                    return {
                      ...p,
                      comments: [...p.comments, ...comments],
                      commentCount: p.comments.length + comments.length,
                    };
                  }
                  return p;
                })
              );
            }
          })
          .catch(error => {
            console.error('[App] Failed to fetch comments:', error);
          });
        
        return currentPosts;
      });
    };

    fetchCommentsForPost();
  }, [selectedBitId]);

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
      result = result.filter(p => 
        p.title.toLowerCase().includes(query) ||
        p.content.toLowerCase().includes(query) ||
        p.author.toLowerCase().includes(query) ||
        p.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    return result;
  }, [posts, activeBoardId, boardsById, feedFilter, searchQuery]);

  // Sort posts based on selected sort mode
  const sortedPosts = useMemo(() => {
    const sorted = [...filteredPosts];
    
    switch (sortMode) {
      case SortMode.NEWEST:
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case SortMode.OLDEST:
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case SortMode.TRENDING:
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
      case SortMode.COMMENTS:
        return sorted.sort((a, b) => b.commentCount - a.commentCount);
      case SortMode.TOP:
      default:
        return sorted.sort((a, b) => b.score - a.score);
    }
  }, [filteredPosts, sortMode]);

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

  /**
   * Handle voting with cryptographic verification
   * Uses Nostr signatures to ensure:
   * - One vote per user (pubkey) per post
   * - Equal influence for all users
   * - Verifiable vote counts
   */
  const handleVote = useCallback(async (postId: string, direction: 'up' | 'down') => {
    // Use postsById for O(1) lookup instead of O(n) find
    const post = postsById.get(postId);
    
    // Get current user state for validation
    const currentUserState = userState;
    const currentVote = currentUserState.votedPosts[postId];
    
    // Check if user has identity (required for cryptographic voting)
    if (!currentUserState.identity) {
      console.warn('[Vote] No identity - connect an identity to vote.');
      return;
    }
    
    // Check bit availability before calculating optimistic update
    if (!currentVote && currentUserState.bits <= 0) {
      console.warn('[Vote] Insufficient bits');
      return;
    }

    // Calculate optimistic update using centralized logic from votingService
    const optimisticUpdate = computeOptimisticUpdate(
      currentVote ?? null,
      direction,
      currentUserState.bits,
      currentUserState.votedPosts,
      postId
    );

    // Apply optimistic UI update
    setUserState(prev => ({
      ...prev,
      bits: optimisticUpdate.newBits,
      votedPosts: optimisticUpdate.newVotedPosts,
    }));

    // Optimistically update post score
    setPosts(currentPosts => 
      currentPosts.map(p => 
        p.id === postId ? { ...p, score: p.score + optimisticUpdate.scoreDelta } : p
      )
    );

    // Publish cryptographically signed vote to Nostr
    if (currentUserState.identity && post?.nostrEventId) {
      const privateKey = identityService.getPrivateKeyBytes();
      if (privateKey) {
        try {
          const result = await votingService.castVote(
            post.nostrEventId,
            direction,
            currentUserState.identity.pubkey,
            privateKey
          );

          if (result.success && result.newTally) {
            // Update with verified tally from Nostr
            setPosts(currentPosts => 
              currentPosts.map(p => 
                p.id === postId ? {
                  ...p,
                  upvotes: result.newTally!.upvotes,
                  downvotes: result.newTally!.downvotes,
                  score: result.newTally!.score,
                  uniqueVoters: result.newTally!.uniqueVoters,
                  votesVerified: true,
                } : p
              )
            );
            console.log(`[Vote] Verified: ${result.newTally.uniqueVoters} unique voters`);
          } else if (result.error) {
            console.error('[Vote] Failed:', result.error);
            // Revert optimistic update on failure using centralized rollback logic
            const rollback = computeRollback(optimisticUpdate, currentUserState.votedPosts, postId);
            setUserState(prev => ({
              ...prev,
              bits: prev.bits + rollback.bitAdjustment,
              votedPosts: rollback.previousVotedPosts,
            }));
            setPosts(currentPosts => 
              currentPosts.map(p => 
                p.id === postId ? { ...p, score: p.score + rollback.scoreDelta } : p
              )
            );
          }
        } catch (error) {
          console.error('[Vote] Error publishing:', error);
        }
      }
    }
  }, [postsById, userState]);

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
      const privateKey = identityService.getPrivateKeyBytes();
      if (privateKey) {
        try {
          // Check if posting to a geohash board and include the geohash
          const targetBoard = boardsById.get(newPostData.boardId);
          const geohash = targetBoard?.type === BoardType.GEOHASH ? targetBoard.geohash : undefined;
          
          const eventPayload = {
            ...newPostData,
            timestamp,
            upvotes: 0,
            downvotes: 0,
          };

          const event = await nostrService.publishPost(eventPayload, privateKey, geohash);
          newPost.nostrEventId = event.id;
          newPost.id = event.id;
        } catch (error) {
          console.error('[App] Failed to publish post to Nostr:', error);
        }
      }
    }

    setPosts(prev => [newPost, ...prev]);
    setViewMode(ViewMode.FEED);
  };

  const handleCreateBoard = async (newBoardData: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>) => {
    const newBoard: Board = {
      ...newBoardData,
      id: `b-${newBoardData.name.toLowerCase()}`,
      memberCount: 1
    };

    // Publish to Nostr if identity exists
    if (userState.identity) {
      const privateKey = identityService.getPrivateKeyBytes();
      if (privateKey) {
        try {
          const event = await nostrService.publishBoard(newBoardData, privateKey);
          newBoard.nostrEventId = event.id;
        } catch (error) {
          console.error('[App] Failed to publish board to Nostr:', error);
        }
      }
    }

    setBoards(prev => [...prev, newBoard]);
    setActiveBoardId(newBoard.id);
    setViewMode(ViewMode.FEED);
  };

  const handleComment = useCallback(async (postId: string, content: string, parentCommentId?: string) => {
    const post = postsById.get(postId);
    if (!post) return;
    
    const newComment = {
      id: `c-${Date.now()}`,
      author: userState.username,
      authorPubkey: userState.identity?.pubkey,
      content: content,
      timestamp: Date.now(),
      parentId: parentCommentId, // For threaded comments
    };

    // Publish to Nostr if connected
    if (userState.identity && post.nostrEventId) {
      const privateKey = identityService.getPrivateKeyBytes();
      if (privateKey) {
        nostrService.publishComment(post.nostrEventId, content, privateKey, parentCommentId)
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
          });
      }
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
  }, [postsById, userState.username, userState.identity]);

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
  const handleSavePost = useCallback((postId: string, updates: Partial<Post>) => {
    setPosts(currentPosts =>
      currentPosts.map(p =>
        p.id === postId ? { ...p, ...updates } : p
      )
    );
    setEditingPostId(null);
    setViewMode(ViewMode.FEED);
  }, []);

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

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono selection:bg-terminal-text selection:text-black relative">
      {/* Scanline Overlay */}
      <div className="scanlines fixed inset-0 pointer-events-none z-50"></div>

      <div className="max-w-[1074px] mx-auto p-4 md:p-6 relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b-2 border-terminal-dim pb-4 gap-4">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors"
            onClick={() => navigateToBoard(null)}
          >
            {theme === ThemeId.BITBORING ? (
              <div className="flex flex-col">
                <h1 className="text-3xl font-bold tracking-tight leading-none">BitBoring</h1>
                <span className="text-sm text-terminal-dim">( -_-) zzz</span>
              </div>
            ) : (
              <>
                <Terminal size={32} />
                <div className="flex flex-col">
                  <h1 className="text-4xl font-terminal tracking-wider leading-none">BitBoard</h1>
                  <span className="text-xs text-terminal-dim tracking-[0.2em]">
                    NOSTR_PROTOCOL // {isNostrConnected ? 'CONNECTED' : 'OFFLINE'}
                  </span>
                </div>
              </>
            )}
          </div>
          
          <nav className="flex gap-4 text-sm md:text-base flex-wrap">
            <button 
              onClick={() => navigateToBoard(null)}
              className={`uppercase hover:underline ${viewMode === ViewMode.FEED && activeBoardId === null ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
            >
              [ Global_Feed ]
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.CREATE)}
              className={`uppercase hover:underline ${viewMode === ViewMode.CREATE ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
            >
              [ New_Bit ]
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.BOOKMARKS)}
              className={`uppercase hover:underline flex items-center gap-1 ${viewMode === ViewMode.BOOKMARKS ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
            >
              <Bookmark size={12} />
              [ Saved{bookmarkedIds.length > 0 ? ` (${bookmarkedIds.length})` : ''} ]
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.IDENTITY)}
              className={`uppercase hover:underline flex items-center gap-1 ${viewMode === ViewMode.IDENTITY ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
            >
              {userState.identity ? <Wifi size={12} /> : <WifiOff size={12} />}
              [ {userState.identity ? 'IDENTITY' : 'CONNECT'} ]
            </button>
          </nav>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Sidebar */}
          <aside className="md:col-span-1 order-first md:order-last space-y-6">
            <BitStatus userState={userState} />
            
            {/* Connection Status */}
            <div className="border border-terminal-dim p-3 bg-terminal-bg shadow-hard">
              <div className="flex items-center gap-2 text-xs">
                {isNostrConnected ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-terminal-dim">NOSTR_RELAYS: ACTIVE</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-terminal-alert" />
                    <span className="text-terminal-dim">OFFLINE_MODE</span>
                  </>
                )}
              </div>
              {userState.identity && (
                <div className="mt-2 text-[10px] text-terminal-dim truncate">
                  npub: {userState.identity.npub.slice(0, 20)}...
                </div>
              )}
            </div>

            {/* Feed Filter (when on global feed) */}
            {!activeBoardId && viewMode === ViewMode.FEED && (
              <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
                <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
                  <Radio size={14} /> FILTER_MODE
                </h3>
                <div className="flex flex-col gap-1">
                  {[
                    { id: 'all', label: 'ALL_SIGNALS', icon: Globe },
                    { id: 'topic', label: 'TOPIC_BOARDS', icon: Hash },
                    { id: 'location', label: 'GEO_CHANNELS', icon: MapPin },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setFeedFilter(id as typeof feedFilter)}
                      className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
                        ${feedFilter === id ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
                      `}
                    >
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Topic Board Directory */}
            <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
              <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
                <Hash size={14} /> TOPIC_BOARDS
              </h3>
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => navigateToBoard(null)}
                  className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
                    ${activeBoardId === null ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
                  `}
                >
                  <Globe size={12} /> GLOBAL_NET
                </button>
                {topicBoards.filter(b => b.isPublic).map(board => (
                   <button 
                    key={board.id}
                    onClick={() => navigateToBoard(board.id)}
                    className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
                      ${activeBoardId === board.id ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
                    `}
                  >
                    <span>//</span> {board.name}
                  </button>
                ))}
                <div className="border-t border-terminal-dim/30 my-2"></div>
                {topicBoards.filter(b => !b.isPublic).map(board => (
                   <button 
                    key={board.id}
                    disabled
                    className="text-left text-sm px-2 py-1 text-terminal-dim/50 flex items-center gap-2 cursor-not-allowed"
                  >
                    <Lock size={10} /> {board.name}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setViewMode(ViewMode.CREATE_BOARD)}
                className="mt-4 w-full text-xs border border-terminal-dim border-dashed text-terminal-dim p-2 hover:text-terminal-text hover:border-solid transition-all"
              >
                + INIT_NEW_BOARD
              </button>
            </div>

            {/* Location Channels */}
            <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
              <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
                <MapPin size={14} /> GEO_CHANNELS
              </h3>
              <div className="flex flex-col gap-1">
                {geohashBoards.length === 0 ? (
                  <p className="text-xs text-terminal-dim py-2">
                    No location channels active. Enable location to discover nearby boards.
                  </p>
                ) : (
                  geohashBoards.map(board => (
                    <button 
                      key={board.id}
                      onClick={() => navigateToBoard(board.id)}
                      className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
                        ${activeBoardId === board.id ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
                      `}
                    >
                      <MapPin size={10} /> #{board.geohash}
                    </button>
                  ))
                )}
              </div>
              <button 
                onClick={() => setViewMode(ViewMode.LOCATION)}
                className="mt-4 w-full text-xs border border-terminal-dim border-dashed text-terminal-dim p-2 hover:text-terminal-text hover:border-solid transition-all flex items-center justify-center gap-2"
              >
                <MapPin size={12} /> FIND_NEARBY
              </button>
            </div>

            {/* Theme Selector */}
            <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
              <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
                <Eye size={14} /> VISUAL_CONFIG
              </h3>
              <div className="grid grid-cols-3 gap-2 py-2">
                {Object.values(ThemeId).map(t => (
                  <button 
                    key={t}
                    onClick={() => setTheme(t)}
                    className="group flex items-center justify-center gap-0.5 font-mono text-sm transition-colors"
                    title={t === ThemeId.BITBORING ? "BITBORING (UGLY MODE)" : t.toUpperCase()}
                  >
                    <span className={`transition-colors ${theme === t ? 'text-terminal-text font-bold' : 'text-terminal-dim group-hover:text-terminal-text'}`}>[</span>
                    <span 
                      className={`w-3 h-3 mx-0.5 transition-transform ${theme === t ? 'scale-125' : 'scale-100 group-hover:scale-110'}`} 
                      style={{ 
                        backgroundColor: getThemeColor(t),
                        border: t === ThemeId.BITBORING ? '1px solid black' : 'none'
                      }}
                    />
                    <span className={`transition-colors ${theme === t ? 'text-terminal-text font-bold' : 'text-terminal-dim group-hover:text-terminal-text'}`}>]</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
              <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
                <HelpCircle size={14} /> USER_ID_CONFIG
              </h3>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-terminal-dim uppercase">Handle:</label>
                <input 
                  type="text"
                  value={userState.username}
                  onChange={(e) => setUserState(prev => ({ ...prev, username: e.target.value }))}
                  className="bg-terminal-bg border border-terminal-dim p-1 text-sm text-terminal-text font-mono focus:outline-none focus:border-terminal-text"
                />
                {userState.identity && (
                  <button
                    onClick={() => setViewMode(ViewMode.IDENTITY)}
                    className="text-xs text-terminal-dim hover:text-terminal-text flex items-center gap-1 mt-2"
                  >
                    <Key size={10} /> Manage Identity
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="md:col-span-3">
            {viewMode === ViewMode.FEED && (
              <div className="space-y-2">
                {/* Search Bar */}
                <div className="mb-4">
                  <SearchBar onSearch={handleSearch} placeholder="Search posts, users, tags..." />
                </div>

                {/* Feed Header */}
                <div className="flex flex-col gap-4 mb-6 pb-2 border-b border-terminal-dim/30">
                  <div className="flex justify-between items-end">
                    <div>
                      <h2 className="text-2xl font-terminal uppercase tracking-widest text-terminal-text flex items-center gap-2">
                        {activeBoard?.type === BoardType.GEOHASH && <MapPin size={20} />}
                        {searchQuery ? `SEARCH: "${searchQuery}"` : activeBoard ? (activeBoard.type === BoardType.GEOHASH ? `#${activeBoard.geohash}` : `// ${activeBoard.name}`) : 'GLOBAL_FEED'}
                      </h2>
                      <p className="text-xs text-terminal-dim mt-1">
                        {searchQuery 
                          ? `${sortedPosts.length} results found` 
                          : activeBoard 
                            ? activeBoard.description 
                            : 'AGGREGATING TOP SIGNALS FROM PUBLIC SECTORS'
                        }
                      </p>
                    </div>
                    <span className="text-xs border border-terminal-dim px-2 py-1">
                      SIGNAL_COUNT: {sortedPosts.length}
                    </span>
                  </div>
                  
                  {/* Sort Selector */}
                  <SortSelector currentSort={sortMode} onSortChange={setSortMode} />
                </div>
                
                {sortedPosts.length === 0 && (
                   <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
                      <div className="text-4xl opacity-20">¯\_(ツ)_/¯</div>
                      <div>
                        <p className="font-bold">&gt; NO DATA PACKETS FOUND</p>
                        <p className="text-xs mt-2">Be the first to transmit on this frequency.</p>
                      </div>
                      <button 
                        onClick={() => setViewMode(ViewMode.CREATE)}
                        className="mt-4 px-4 py-2 border border-terminal-dim hover:bg-terminal-dim hover:text-white transition-colors uppercase text-sm"
                      >
                        [ INIT_BIT ]
                      </button>
                   </div>
                )}

                {sortedPosts.map(post => (
                  <PostItem 
                    key={post.id} 
                    post={post} 
                    boardName={getBoardName(post.id)}
                    userState={userState}
                    knownUsers={knownUsers}
                    onVote={handleVote}
                    onComment={handleComment}
                    onViewBit={handleViewBit}
                    onViewProfile={handleViewProfile}
                    onEditPost={handleEditPost}
                    onTagClick={handleTagClick}
                    isNostrConnected={isNostrConnected}
                  />
                ))}

                {/* Infinite scroll loader */}
                <div 
                  ref={loaderRef} 
                  className="py-8 text-center"
                >
                  {isLoadingMore && (
                    <div className="flex items-center justify-center gap-3 text-terminal-dim">
                      <div className="animate-pulse">▓▓▓</div>
                      <span className="text-sm uppercase tracking-wider">Loading more signals...</span>
                      <div className="animate-pulse">▓▓▓</div>
                    </div>
                  )}
                  {!hasMorePosts && sortedPosts.length > 0 && (
                    <div className="text-xs text-terminal-dim uppercase tracking-wider border border-terminal-dim/30 inline-block px-4 py-2">
                      END_OF_FEED // All signals loaded
                    </div>
                  )}
                </div>
              </div>
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
                    onViewBit={() => {}}
                    onViewProfile={handleViewProfile}
                    onEditPost={handleEditPost}
                    onTagClick={handleTagClick}
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
              />
            )}

            {viewMode === ViewMode.IDENTITY && (
              <IdentityManager
                onIdentityChange={handleIdentityChange}
                onClose={returnToFeed}
              />
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
                userState={userState}
                onVote={handleVote}
                onComment={handleComment}
                onViewBit={handleViewBit}
                onClose={returnToFeed}
                isNostrConnected={isNostrConnected}
              />
            )}

            {viewMode === ViewMode.BOOKMARKS && (
              <Bookmarks
                posts={posts}
                bookmarkedIds={bookmarkedIds}
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
          </main>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="text-center text-terminal-dim text-xs py-8 opacity-50">
        BitBoard NOSTR PROTOCOL V3.0 // RELAYS: {nostrService.getRelays().length} // NODES ACTIVE: {boards.length + locationBoards.length}
      </footer>
    </div>
  );
}
