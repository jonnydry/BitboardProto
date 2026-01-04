import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { SimplePool } from 'nostr-tools';
import { NostrService } from '../../services/nostr/NostrService';
import { NostrProfileCache } from '../../services/nostr/profileCache';
import { nostrEventDeduplicator } from '../../services/messageDeduplicator';
import { inputValidator } from '../../services/inputValidator';
import { diagnosticsService } from '../../services/diagnosticsService';
import { logger } from '../../services/loggingService';

// Mock dependencies
vi.mock('nostr-tools', () => ({
  SimplePool: vi.fn(),
}));

vi.mock('../../services/nostr/profileCache');
vi.mock('../../services/messageDeduplicator');
vi.mock('../../services/inputValidator');
vi.mock('../../services/diagnosticsService');
vi.mock('../../services/loggingService');

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('NostrService', () => {
  let service: NostrService;
  let mockPool: any;
  let mockProfileCache: any;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockImplementation(() => {});

    // Mock SimplePool
    mockPool = {
      publish: vi.fn(),
      querySync: vi.fn(),
      subscribeMany: vi.fn(),
    };
    (SimplePool as Mock).mockImplementation(() => mockPool);

    // Mock ProfileCache
    mockProfileCache = {
      clear: vi.fn(),
      getDisplayName: vi.fn(),
      fetchProfiles: vi.fn(),
      destroy: vi.fn(),
    };
    (NostrProfileCache as Mock).mockImplementation(() => mockProfileCache);

    // Mock other dependencies
    (nostrEventDeduplicator.isEventDuplicate as Mock).mockReturnValue(false);
    (nostrEventDeduplicator.markProcessed as Mock).mockImplementation(() => {});
    (inputValidator.validateTitle as Mock).mockImplementation((title) => title);
    (inputValidator.validatePostContent as Mock).mockImplementation((content) => content);
    (inputValidator.validateCommentContent as Mock).mockImplementation((content) => content);
    (inputValidator.validateTags as Mock).mockImplementation((tags) => tags);
    (inputValidator.validateUrl as Mock).mockImplementation((url) => url);
    (diagnosticsService.warn as Mock).mockImplementation(() => {});
    (diagnosticsService.error as Mock).mockImplementation(() => {});
    (logger.mark as Mock).mockImplementation(() => {});
    (logger.debug as Mock).mockImplementation(() => {});
    (logger.info as Mock).mockImplementation(() => {});
    (logger.warn as Mock).mockImplementation(() => {});
    (mockProfileCache.getDisplayName as Mock).mockReturnValue('TestUser');

    service = new NostrService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize with default relays', () => {
      const relays = service.getRelays();
      expect(relays.length).toBeGreaterThan(0);
      expect(relays.every(r => r.url.startsWith('wss://') || r.url.startsWith('ws://'))).toBe(true);
    });

    it('should load user relays from localStorage', () => {
      const storedRelays = ['wss://custom.relay.com'];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(storedRelays));

      const newService = new NostrService();
      expect(newService.getUserRelays()).toEqual(storedRelays);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('bitboard_user_relays_v1');
    });

    it('should handle invalid localStorage data gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      expect(() => new NostrService()).not.toThrow();
    });

    it('should initialize relay statuses for all relays', () => {
      const statuses = service.getRelayStatuses();
      expect(statuses.length).toBeGreaterThan(0);
      statuses.forEach(status => {
        expect(status).toHaveProperty('url');
        expect(status).toHaveProperty('isConnected', false);
        expect(status).toHaveProperty('lastError', null);
      });
    });
  });

  describe('Relay Management', () => {
    it('should allow setting user relays', () => {
      const userRelays = ['wss://user.relay1.com', 'wss://user.relay2.com'];
      service.setUserRelays(userRelays);

      expect(service.getUserRelays()).toEqual(userRelays);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'bitboard_user_relays_v1',
        JSON.stringify(userRelays)
      );
    });

    it('should filter out invalid relay URLs', () => {
      const invalidRelays = ['invalid', 'http://invalid.com', 'wss://valid.com'];
      service.setUserRelays(invalidRelays);

      expect(service.getUserRelays()).toEqual(['wss://valid.com']);
    });

    it('should merge user relays with defaults', () => {
      const userRelays = ['wss://user.relay.com'];
      service.setUserRelays(userRelays);

      const allRelays = service.getRelays().map(r => r.url);
      expect(allRelays).toContain('wss://user.relay.com');
      expect(allRelays.length).toBeGreaterThan(1); // Should include defaults
    });

    it('should provide separate read and publish relay lists', () => {
      const userRelays = ['wss://user.relay.com'];
      service.setUserRelays(userRelays);

      // Both should include user relays first, then defaults
      expect(service.getRelays().some(r => r.url === 'wss://user.relay.com')).toBe(true);
    });

    it('should track connection status', () => {
      const relayUrl = service.getRelays()[0].url;
      expect(service.isConnected()).toBe(false);

      // Simulate connection
      service['updateRelayStatus'](relayUrl, true);
      expect(service.getConnectedCount()).toBe(1);
      expect(service.isConnected()).toBe(true);
    });

    it('should handle relay disconnection with backoff', () => {
      const relayUrl = service.getRelays()[0].url;
      const error = new Error('Connection failed');

      service['handleRelayDisconnection'](relayUrl, error);

      const status = service.getRelayStatuses().find(s => s.url === relayUrl);
      expect(status?.isConnected).toBe(false);
      expect(status?.lastError).toBe(error);
      expect(status?.reconnectAttempts).toBe(1);
    });
  });

  describe('Publishing Events', () => {
    const mockEvent = {
      id: 'test-event-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'test content',
      sig: 'test-signature'
    };

    it('should publish event successfully', async () => {
      mockPool.publish.mockResolvedValue(mockEvent);

      await expect(service.publishSignedEvent(mockEvent)).resolves.toBe(mockEvent);
      expect(mockPool.publish).toHaveBeenCalledWith(
        expect.any(Array), // relays array
        mockEvent
      );
    });

    it('should queue event when no relays are connected', async () => {
      mockPool.publish.mockRejectedValue(new Error('No relays available'));

      await expect(service.publishSignedEvent(mockEvent)).rejects.toThrow();
      expect(service.getQueuedMessageCount()).toBe(1);
    });

    it('should retry queued messages when relay connects', async () => {
      // Force all relays to fail to queue the message
      mockPool.publish.mockRejectedValue(new Error('All relays failed'));
      await expect(service.publishSignedEvent(mockEvent)).rejects.toThrow();

      expect(service.getQueuedMessageCount()).toBe(1);

      // Simulate relay connection
      const relayUrl = service.getRelays()[0].url;
      mockPool.publish.mockResolvedValue(mockEvent);
      service['updateRelayStatus'](relayUrl, true);

      // Wait for flush to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(service.getQueuedMessageCount()).toBe(0);
    });

    it('should handle partial publish failures', async () => {
      const _relays = service.getRelays().map(r => r.url);
      mockPool.publish
        .mockResolvedValueOnce(mockEvent) // First relay succeeds
        .mockRejectedValueOnce(new Error('Second relay failed')); // Second fails

      await expect(service.publishSignedEvent(mockEvent)).resolves.toBe(mockEvent);

      // Should still queue for failed relay
      expect(service.getQueuedMessageCount()).toBeGreaterThan(0);
    });

    it('should deduplicate published events', async () => {
      mockPool.publish.mockResolvedValue(mockEvent);
      (nostrEventDeduplicator.markProcessed as Mock).mockClear();

      await service.publishSignedEvent(mockEvent);

      expect(nostrEventDeduplicator.markProcessed).toHaveBeenCalledWith(mockEvent.id);
    });
  });

  describe('Fetching Posts', () => {
    const mockPostEvent = {
      id: 'post-1',
      pubkey: 'author-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [
        ['title', 'Test Post'],
        ['board', 'test-board'],
        ['client', 'bitboard']
      ],
      content: 'Post content',
      sig: 'signature'
    };

    it('should fetch posts with default filters', async () => {
      mockPool.querySync.mockResolvedValue([mockPostEvent]);

      const posts = await service.fetchPosts();

      expect(mockPool.querySync).toHaveBeenCalledWith(
        expect.any(Array), // relays
        expect.objectContaining({
          kinds: [1],
          '#client': ['bitboard'],
          limit: expect.any(Number)
        })
      );
      expect(posts).toHaveLength(1);
    });

    it('should filter posts by board', async () => {
      mockPool.querySync.mockResolvedValue([mockPostEvent]);

      await service.fetchPosts({ boardId: 'test-board' });

      expect(mockPool.querySync).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          '#board': ['test-board']
        })
      );
    });

    it('should filter posts by geohash', async () => {
      mockPool.querySync.mockResolvedValue([mockPostEvent]);

      await service.fetchPosts({ geohash: 'abc123' });

      expect(mockPool.querySync).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          '#g': ['abc123']
        })
      );
    });

    it('should handle query timeouts gracefully', async () => {
      mockPool.querySync.mockImplementation(() =>
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
      );

      const posts = await service.fetchPosts();
      expect(posts).toEqual([]); // Should return empty array on timeout
    });

    it('should deduplicate events', async () => {
      mockPool.querySync.mockResolvedValue([mockPostEvent, mockPostEvent]);
      (nostrEventDeduplicator.isEventDuplicate as Mock).mockReturnValueOnce(false).mockReturnValueOnce(true);

      const posts = await service.fetchPosts();

      expect(posts).toHaveLength(1);
      expect(nostrEventDeduplicator.isEventDuplicate).toHaveBeenCalledTimes(2);
    });

    it('should filter out non-post events', async () => {
      const nonPostEvent = { ...mockPostEvent, tags: [['client', 'other']] };
      mockPool.querySync.mockResolvedValue([mockPostEvent, nonPostEvent]);

      const posts = await service.fetchPosts();

      expect(posts).toHaveLength(1);
      expect(posts[0]).toBe(mockPostEvent);
    });
  });

  describe('Fetching Comments', () => {
    const mockCommentEvent = {
      id: 'comment-1',
      pubkey: 'commenter-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [
        ['e', 'post-1', '', 'root'],
        ['client', 'bitboard']
      ],
      content: 'Comment content',
      sig: 'signature'
    };

    it('should fetch comments for a post', async () => {
      mockPool.querySync.mockResolvedValue([mockCommentEvent]);

      const comments = await service.fetchComments('post-1');

      expect(mockPool.querySync).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          kinds: [1],
          '#e': ['post-1'],
          '#client': ['bitboard']
        })
      );
      expect(comments).toHaveLength(1);
    });

    it('should filter out non-comment events', async () => {
      const nonCommentEvent = { ...mockCommentEvent, tags: [['client', 'other']] };
      mockPool.querySync.mockResolvedValue([mockCommentEvent, nonCommentEvent]);

      const comments = await service.fetchComments('post-1');

      expect(comments).toHaveLength(1);
    });
  });

  describe('Fetching Votes', () => {
    const mockUpvote = {
      id: 'vote-1',
      pubkey: 'voter-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 7,
      tags: [['e', 'post-1']],
      content: '+',
      sig: 'signature'
    };

    const mockDownvote = {
      id: 'vote-2',
      pubkey: 'voter-pubkey-2',
      created_at: Math.floor(Date.now() / 1000),
      kind: 7,
      tags: [['e', 'post-1']],
      content: '-',
      sig: 'signature'
    };

    it('should fetch vote events', async () => {
      mockPool.querySync.mockResolvedValue([mockUpvote, mockDownvote]);

      const votes = await service.fetchVoteEvents('post-1');

      expect(votes).toHaveLength(2);
      expect(mockPool.querySync).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          kinds: [7],
          '#e': ['post-1']
        })
      );
    });

    it('should calculate vote counts correctly', async () => {
      mockPool.querySync.mockResolvedValue([mockUpvote, mockDownvote]);

      const result = await service.fetchVotesForPost('post-1');

      expect(result.up).toBe(1);
      expect(result.down).toBe(1);
      expect(result.events).toHaveLength(2);
    });

    it('should deduplicate votes by pubkey (latest wins)', async () => {
      // Same pubkey voting multiple times - latest should win
      const laterDownvote = {
        ...mockUpvote,
        id: 'vote-1-later',
        created_at: mockUpvote.created_at + 100,
        content: '-' // Changed from upvote to downvote
      };

      mockPool.querySync.mockResolvedValue([mockUpvote, laterDownvote]);

      const result = await service.fetchVotesForPost('post-1');

      expect(result.up).toBe(0); // First vote overridden
      expect(result.down).toBe(1); // Latest vote wins
    });
  });

  describe('Subscriptions', () => {
    it('should create feed subscription', () => {
      const mockSub = { close: vi.fn() };
      mockPool.subscribeMany.mockReturnValue(mockSub);

      const onEvent = vi.fn();
      const subId = service.subscribeToFeed(onEvent);

      expect(subId).toMatch(/^feed-\d+$/);
      expect(mockPool.subscribeMany).toHaveBeenCalledWith(
        expect.any(Array), // relays
        [expect.objectContaining({
          kinds: [1],
          '#client': ['bitboard'],
          since: expect.any(Number)
        })],
        expect.objectContaining({
          onevent: expect.any(Function),
          oneose: expect.any(Function)
        })
      );
    });

    it('should filter feed subscription by board', () => {
      const mockSub = { close: vi.fn() };
      mockPool.subscribeMany.mockReturnValue(mockSub);

      const onEvent = vi.fn();
      service.subscribeToFeed(onEvent, { boardId: 'test-board' });

      expect(mockPool.subscribeMany).toHaveBeenCalledWith(
        expect.any(Array),
        [expect.objectContaining({
          '#board': ['test-board']
        })],
        expect.any(Object)
      );
    });

    it('should unsubscribe correctly', () => {
      const mockSub = { close: vi.fn() };
      mockPool.subscribeMany.mockReturnValue(mockSub);

      const onEvent = vi.fn();
      const subId = service.subscribeToFeed(onEvent);

      service.unsubscribe(subId);

      expect(mockSub.close).toHaveBeenCalled();
    });

    it('should unsubscribe all subscriptions', () => {
      const mockSub1 = { close: vi.fn() };
      const mockSub2 = { close: vi.fn() };
      mockPool.subscribeMany
        .mockReturnValueOnce(mockSub1)
        .mockReturnValueOnce(mockSub2);

      const _subId1 = service.subscribeToFeed(vi.fn());
      const _subId2 = service.subscribeToFeed(vi.fn());

      service.unsubscribeAll();

      expect(mockSub1.close).toHaveBeenCalled();
      expect(mockSub2.close).toHaveBeenCalled();
    });
  });

  describe('Event Conversion', () => {
    it('should convert event to post', () => {
      const event = {
        id: 'post-id',
        pubkey: 'author-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [
          ['title', 'Test Post'],
          ['client', 'bitboard']
        ],
        content: 'Post content',
        sig: 'signature'
      };

      const post = service.eventToPost(event);

      expect(post.id).toBe('post-id');
      expect(post.title).toBe('Test Post');
      expect(post.content).toBe('Post content');
      expect(post.authorPubkey).toBe('author-pubkey');
    });

    it('should handle encrypted posts', () => {
      const event = {
        id: 'encrypted-post-id',
        pubkey: 'author-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [
          ['title', 'Encrypted Title'],
          ['encrypted', 'true'],
          ['encrypted_title', 'encrypted-title-data'],
          ['client', 'bitboard']
        ],
        content: 'encrypted-content-data',
        sig: 'signature'
      };

      const post = service.eventToPost(event);

      expect(post.isEncrypted).toBe(true);
      expect(post.encryptedTitle).toBe('encrypted-title-data');
      expect(post.encryptedContent).toBe('encrypted-content-data');
      expect(post.title).toBe('[Encrypted]');
      expect(post.content).toBe('[Encrypted - Access Required]');
    });

    it('should convert event to comment', () => {
      const event = {
        id: 'comment-id',
        pubkey: 'commenter-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [
          ['e', 'parent-post-id', '', 'root'],
          ['client', 'bitboard']
        ],
        content: 'Comment content',
        sig: 'signature'
      };

      const comment = service.eventToComment(event);

      expect(comment.id).toBe('comment-id');
      expect(comment.content).toBe('Comment content');
      expect(comment.authorPubkey).toBe('commenter-pubkey');
    });

    it('should handle encrypted comments', () => {
      const event = {
        id: 'encrypted-comment-id',
        pubkey: 'commenter-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [
          ['e', 'parent-post-id', '', 'root'],
          ['encrypted', 'true'],
          ['client', 'bitboard']
        ],
        content: 'encrypted-comment-content',
        sig: 'signature'
      };

      const comment = service.eventToComment(event);

      expect(comment.isEncrypted).toBe(true);
      expect(comment.encryptedContent).toBe('encrypted-comment-content');
      expect(comment.content).toBe('[Encrypted - Access Required]');
    });
  });

  describe('Event Type Detection', () => {
    it('should identify BitBoard posts', () => {
      const postEvent = {
        id: '1',
        pubkey: 'pubkey',
        created_at: 123,
        kind: 1,
        tags: [
          ['title', 'Test'],
          ['board', 'test'],
          ['client', 'bitboard']
        ],
        content: 'content',
        sig: 'sig'
      };

      expect(service.isBitboardPostEvent(postEvent)).toBe(true);
    });

    it('should identify BitBoard comments', () => {
      const commentEvent = {
        id: '1',
        pubkey: 'pubkey',
        created_at: 123,
        kind: 1,
        tags: [
          ['e', 'post-id', '', 'root'],
          ['client', 'bitboard']
        ],
        content: 'content',
        sig: 'sig'
      };

      expect(service.isBitboardCommentEvent(commentEvent)).toBe(true);
      expect(service.isBitboardCommentEvent(commentEvent, 'post-id')).toBe(true);
    });

    it('should identify post edit events', () => {
      const editEvent = {
        id: '1',
        pubkey: 'pubkey',
        created_at: 123,
        kind: 1,
        tags: [
          ['bb', 'post_edit'],
          ['e', 'original-post-id'],
          ['client', 'bitboard']
        ],
        content: 'content',
        sig: 'sig'
      };

      expect(service.isBitboardPostEditEvent(editEvent)).toBe(true);
    });

    it('should identify comment edit events', () => {
      const editEvent = {
        id: '1',
        pubkey: 'pubkey',
        created_at: 123,
        kind: 1,
        tags: [
          ['bb', 'comment_edit'],
          ['e', 'post-id'],
          ['e', 'comment-id', '', 'edit'],
          ['client', 'bitboard']
        ],
        content: 'content',
        sig: 'sig'
      };

      expect(service.isBitboardCommentEditEvent(editEvent)).toBe(true);
    });

    it('should identify comment delete events', () => {
      const deleteEvent = {
        id: '1',
        pubkey: 'pubkey',
        created_at: 123,
        kind: 5,
        tags: [
          ['bb', 'comment_delete'],
          ['e', 'post-id'],
          ['e', 'comment-id', '', 'delete'],
          ['client', 'bitboard']
        ],
        content: '',
        sig: 'sig'
      };

      expect(service.isBitboardCommentDeleteEvent(deleteEvent)).toBe(true);
    });
  });

  describe('Profile Management', () => {
    it('should fetch profiles', async () => {
      const mockProfiles = new Map([['pubkey1', { name: 'User1' }]]);
      mockProfileCache.fetchProfiles.mockResolvedValue(mockProfiles);

      const result = await service.fetchProfiles(['pubkey1']);

      expect(mockProfileCache.fetchProfiles).toHaveBeenCalledWith(['pubkey1'], {});
      expect(result).toBe(mockProfiles);
    });

    it('should get display name', () => {
      mockProfileCache.getDisplayName.mockReturnValue('TestUser');

      const name = service.getDisplayName('pubkey1');

      expect(mockProfileCache.getDisplayName).toHaveBeenCalledWith('pubkey1');
      expect(name).toBe('TestUser');
    });

    it('should clear profile cache', () => {
      service.clearProfileCache('pubkey1');

      expect(mockProfileCache.clear).toHaveBeenCalledWith('pubkey1');

      service.clearProfileCache(); // Clear all

      expect(mockProfileCache.clear).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Message Queue Management', () => {
    const mockEvent = {
      id: 'queued-event',
      pubkey: 'pubkey',
      created_at: 123,
      kind: 1,
      tags: [],
      content: 'content',
      sig: 'sig'
    };

    it('should queue messages when publishing fails', async () => {
      mockPool.publish.mockRejectedValue(new Error('Publish failed'));

      await expect(service.publishSignedEvent(mockEvent)).rejects.toThrow();

      expect(service.getQueuedMessageCount()).toBe(1);
    });

    it('should flush queued messages when relay connects', () => {
      // Add message to queue manually
      service['messageQueue'].push({
        event: mockEvent,
        pendingRelays: new Set(['wss://relay.com']),
        timestamp: Date.now()
      });

      mockPool.publish.mockResolvedValue(mockEvent);

      // Simulate relay connection
      service['flushMessageQueue']('wss://relay.com');

      expect(service.getQueuedMessageCount()).toBe(0);
    });

    it('should clean up old queued messages', () => {
      // Add old message
      service['messageQueue'].push({
        event: mockEvent,
        pendingRelays: new Set(['wss://relay.com']),
        timestamp: Date.now() - (25 * 60 * 1000) // 25 minutes ago
      });

      service['cleanupMessageQueue']();

      expect(service.getQueuedMessageCount()).toBe(0);
    });
  });

  describe('Preconnect', () => {
    it('should attempt to preconnect to relays', async () => {
      mockPool.querySync.mockResolvedValue([]);

      await service.preconnect();

      expect(mockPool.querySync).toHaveBeenCalled();
    });

    it('should handle preconnect failures gracefully', async () => {
      mockPool.querySync.mockRejectedValue(new Error('Connection failed'));

      await expect(service.preconnect()).resolves.not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on cleanup', () => {
      const mockSub = { close: vi.fn() };
      mockPool.subscribeMany.mockReturnValue(mockSub);

      service.subscribeToFeed(vi.fn());
      service.cleanup();

      expect(mockSub.close).toHaveBeenCalled();
      expect(mockProfileCache.destroy).toHaveBeenCalled();
    });

    it('should reset relay statuses on cleanup', () => {
      const relayUrl = service.getRelays()[0].url;
      service['updateRelayStatus'](relayUrl, true);

      service.cleanup();

      const status = service.getRelayStatuses().find(s => s.url === relayUrl);
      expect(status?.isConnected).toBe(false);
      expect(status?.lastDisconnectedAt).toBeDefined();
    });
  });

  describe('Network Status', () => {
    it('should track active publishes', async () => {
      mockPool.publish.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      const publishPromise = service.publishSignedEvent({
        id: '1', pubkey: '1', created_at: 1, kind: 1, tags: [], content: 'test', sig: 'sig'
      });

      const status = service.getNetworkStatus();
      expect(status.isPublishing).toBe(true);

      await publishPromise;

      const finalStatus = service.getNetworkStatus();
      expect(finalStatus.isPublishing).toBe(false);
    });

    it('should track active fetches', async () => {
      mockPool.querySync.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100, [])));

      const fetchPromise = service.fetchPosts();

      const status = service.getNetworkStatus();
      expect(status.isFetching).toBe(true);

      await fetchPromise;

      const finalStatus = service.getNetworkStatus();
      expect(finalStatus.isFetching).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle relay DNS failures', () => {
      const relayUrl = service.getRelays()[0].url; // Use an existing relay
      const error = new Error('ENOTFOUND nonexistent.relay.com');

      service['handleRelayDisconnection'](relayUrl, error);

      const status = service.getRelayStatuses().find(s => s.url === relayUrl);
      expect(status?.reconnectAttempts).toBe(10); // MAX_RECONNECT_ATTEMPTS = 10
    });

    it('should handle publish failures gracefully', async () => {
      mockPool.publish.mockRejectedValue(new Error('Network error'));

      await expect(service.publishSignedEvent({
        id: '1', pubkey: '1', created_at: 1, kind: 1, tags: [], content: 'test', sig: 'sig'
      })).rejects.toThrow();

      // Should not crash the service
      expect(service.getNetworkStatus()).toBeDefined();
    });

    it('should handle query failures gracefully', async () => {
      mockPool.querySync.mockRejectedValue(new Error('Query failed'));

      const posts = await service.fetchPosts();

      expect(posts).toEqual([]); // Should return empty array
    });
  });
});
