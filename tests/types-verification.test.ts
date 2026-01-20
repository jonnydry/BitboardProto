/**
 * Test file to verify types.ts exports match service expectations
 */
import { describe, it, expect } from 'vitest';

// Import all types that services depend on
import {
  // Core types
  type NostrEvent,
  type UnsignedNostrEvent,
  type NostrIdentity,
  type LocalNostrIdentity,
  type Nip07NostrIdentity,
  type Post,
  type Comment,
  type Board,
  type UserState,
  type SyncStatus,
  BoardType,
  GeohashPrecision,
  ViewMode,
  SortMode,
  ThemeId,
  ReportType,
  
  // NOSTR_KINDS constant
  NOSTR_KINDS,
  
  // Zap types (NIP-57)
  type ZapRequest,
  type ZapReceipt,
  type ZapTally,
  type LNURLPayResponse,
  
  // Badge types (NIP-58)
  type BadgeDefinition,
  type BadgeAward,
  type ProfileBadge,
  
  // List types (NIP-51)
  type NostrList,
  
  // Community types (NIP-72)
  type Community,
  type CommunityApproval,
  
  // Live Event types (NIP-53)
  type LiveEvent,
  
  // WoT types
  type WoTScore,
} from '../types';

describe('Types.ts Exports', () => {
  describe('Core Types', () => {
    it('exports Post type with all expected fields', () => {
      const mockPost: Post = {
        id: 'test',
        boardId: 'board',
        title: 'Test',
        author: 'Author',
        content: 'Content',
        timestamp: Date.now(),
        score: 0,
        commentCount: 0,
        tags: [],
        comments: [],
        upvotes: 0,
        downvotes: 0,
      };
      expect(mockPost.id).toBeDefined();
      expect(mockPost.boardId).toBeDefined();
      expect(mockPost.title).toBeDefined();
      
      // Optional NIP-57 zap fields
      const postWithZaps: Post = {
        ...mockPost,
        zapCount: 5,
        zapTotal: 1000,
      };
      expect(postWithZaps.zapCount).toBe(5);
    });

    it('exports Comment type with all expected fields', () => {
      const mockComment: Comment = {
        id: 'test',
        author: 'Author',
        content: 'Content',
        timestamp: Date.now(),
      };
      expect(mockComment.id).toBeDefined();
      
      // Optional voting fields
      const commentWithVotes: Comment = {
        ...mockComment,
        score: 10,
        upvotes: 12,
        downvotes: 2,
        uniqueVoters: 14,
        votesVerified: true,
      };
      expect(commentWithVotes.score).toBe(10);
    });

    it('exports Board type with all expected fields', () => {
      const mockBoard: Board = {
        id: 'test',
        name: 'Test Board',
        description: 'Description',
        isPublic: true,
        memberCount: 0,
        type: BoardType.TOPIC,
      };
      expect(mockBoard.id).toBeDefined();
    });
  });

  describe('NOSTR_KINDS Constant', () => {
    it('has all standard event kinds', () => {
      expect(NOSTR_KINDS.METADATA).toBe(0);
      expect(NOSTR_KINDS.POST).toBe(1);
      expect(NOSTR_KINDS.CONTACT_LIST).toBe(3);
      expect(NOSTR_KINDS.ENCRYPTED_DM).toBe(4);
      expect(NOSTR_KINDS.DELETE).toBe(5);
      expect(NOSTR_KINDS.REACTION).toBe(7);
      expect(NOSTR_KINDS.REPORT).toBe(1984);
    });

    it('has NIP-57 zap kinds', () => {
      expect(NOSTR_KINDS.ZAP_REQUEST).toBe(9734);
      expect(NOSTR_KINDS.ZAP_RECEIPT).toBe(9735);
    });

    it('has NIP-58 badge kinds', () => {
      expect(NOSTR_KINDS.BADGE_AWARD).toBe(8);
      expect(NOSTR_KINDS.BADGE_DEFINITION).toBe(30009);
      expect(NOSTR_KINDS.BADGE_PROFILE).toBe(30008);
    });

    it('has NIP-51 list kinds', () => {
      expect(NOSTR_KINDS.MUTE_LIST).toBe(10000);
      expect(NOSTR_KINDS.PIN_LIST).toBe(10001);
      expect(NOSTR_KINDS.RELAY_LIST).toBe(10002);
      expect(NOSTR_KINDS.BOOKMARKS).toBe(10003);
      expect(NOSTR_KINDS.COMMUNITIES_LIST).toBe(10004);
    });

    it('has NIP-72 community kinds', () => {
      expect(NOSTR_KINDS.COMMUNITY_DEFINITION).toBe(34550);
      expect(NOSTR_KINDS.COMMUNITY_APPROVAL).toBe(4550);
    });

    it('has NIP-23 long-form kind', () => {
      expect(NOSTR_KINDS.LONG_FORM).toBe(30023);
    });

    it('has NIP-53 live event kinds', () => {
      expect(NOSTR_KINDS.LIVE_EVENT).toBe(30311);
      expect(NOSTR_KINDS.LIVE_CHAT).toBe(1311);
    });

    it('has NIP-17 private DM kinds', () => {
      expect(NOSTR_KINDS.SEAL).toBe(13);
      expect(NOSTR_KINDS.PRIVATE_DM).toBe(14);
      expect(NOSTR_KINDS.GIFT_WRAP).toBe(1059);
    });
  });

  describe('NIP-57 Zap Types', () => {
    it('ZapReceipt has expected structure', () => {
      const mockReceipt: ZapReceipt = {
        id: 'event-id',
        zapperPubkey: 'pubkey1',
        recipientPubkey: 'pubkey2',
        amount: 1000,
        content: 'Great post!',
        timestamp: Date.now(),
      };
      expect(mockReceipt.zapperPubkey).toBeDefined();
      expect(mockReceipt.amount).toBe(1000);
    });

    it('ZapTally has expected structure', () => {
      const mockTally: ZapTally = {
        eventId: 'event-id',
        totalSats: 5000,
        zapCount: 10,
        topZappers: [{ pubkey: 'pk1', amount: 1000 }],
        lastUpdated: Date.now(),
      };
      expect(mockTally.totalSats).toBe(5000);
    });

    it('LNURLPayResponse has expected structure', () => {
      const mockResponse: LNURLPayResponse = {
        callback: 'https://example.com/pay',
        maxSendable: 1000000,
        minSendable: 1000,
        metadata: '[]',
        tag: 'payRequest',
      };
      expect(mockResponse.tag).toBe('payRequest');
    });
  });

  describe('NIP-58 Badge Types', () => {
    it('BadgeDefinition has expected structure', () => {
      const mockBadge: BadgeDefinition = {
        id: 'badge-id',
        creatorPubkey: 'pubkey',
        name: 'Founding Member',
      };
      expect(mockBadge.name).toBe('Founding Member');
    });

    it('BadgeAward has expected structure', () => {
      const mockAward: BadgeAward = {
        id: 'award-id',
        badgeId: 'badge-id',
        awardedTo: ['pubkey1', 'pubkey2'],
        awardedBy: 'creator-pubkey',
        timestamp: Date.now(),
      };
      expect(mockAward.awardedTo.length).toBe(2);
    });

    it('ProfileBadge has expected structure', () => {
      const mockProfileBadge: ProfileBadge = {
        badgeId: '30009:pubkey:badge-id',
        awardEventId: 'award-event-id',
      };
      expect(mockProfileBadge.badgeId).toBeDefined();
    });
  });

  describe('NIP-51 List Types', () => {
    it('NostrList has expected structure', () => {
      const mockList: NostrList = {
        id: 'list-id',
        kind: 10000,
        pubkeys: ['pubkey1', 'pubkey2'],
        eventIds: [],
        addresses: [],
        hashtags: [],
        createdAt: Date.now(),
      };
      expect(mockList.kind).toBe(10000);
      expect(mockList.pubkeys.length).toBe(2);
    });
  });

  describe('NIP-72 Community Types', () => {
    it('Community has expected structure', () => {
      const mockCommunity: Community = {
        id: 'community-id',
        name: 'Test Community',
        creatorPubkey: 'pubkey',
        moderators: ['mod1', 'mod2'],
      };
      expect(mockCommunity.moderators.length).toBe(2);
    });

    it('CommunityApproval has expected structure', () => {
      const mockApproval: CommunityApproval = {
        id: 'approval-id',
        communityId: 'community-id',
        postEventId: 'post-id',
        approverPubkey: 'mod-pubkey',
        timestamp: Date.now(),
      };
      expect(mockApproval.approverPubkey).toBeDefined();
    });
  });

  describe('NIP-53 Live Event Types', () => {
    it('LiveEvent has expected structure', () => {
      const mockEvent: LiveEvent = {
        id: 'event-id',
        title: 'Live AMA',
        status: 'planned',
        hostPubkey: 'host-pubkey',
        participants: [
          { pubkey: 'pk1', role: 'host' },
          { pubkey: 'pk2', role: 'speaker' },
        ],
        hashtags: ['ama', 'bitcoin'],
      };
      expect(mockEvent.status).toBe('planned');
      expect(mockEvent.participants.length).toBe(2);
    });
  });

  describe('WoT Types', () => {
    it('WoTScore has expected structure', () => {
      const mockScore: WoTScore = {
        pubkey: 'pubkey',
        distance: 2,
        score: 0.25,
        followedBy: ['pk1', 'pk2'],
      };
      expect(mockScore.distance).toBe(2);
      expect(mockScore.score).toBe(0.25);
    });
  });

  describe('Enums', () => {
    it('BoardType has expected values', () => {
      expect(BoardType.TOPIC).toBe('topic');
      expect(BoardType.GEOHASH).toBe('geohash');
    });

    it('GeohashPrecision has expected values', () => {
      expect(GeohashPrecision.COUNTRY).toBe(2);
      expect(GeohashPrecision.CITY).toBe(5);
      expect(GeohashPrecision.NEIGHBORHOOD).toBe(6);
    });

    it('ViewMode has expected values', () => {
      expect(ViewMode.FEED).toBe('FEED');
      expect(ViewMode.CREATE).toBe('CREATE');
      expect(ViewMode.DIRECT_MESSAGES).toBe('DIRECT_MESSAGES');
    });

    it('SortMode has expected values', () => {
      expect(SortMode.TOP).toBe('top');
      expect(SortMode.NEWEST).toBe('newest');
      expect(SortMode.TRENDING).toBe('trending');
    });

    it('ReportType has expected values', () => {
      expect(ReportType.SPAM).toBe('spam');
      expect(ReportType.ILLEGAL).toBe('illegal');
      expect(ReportType.IMPERSONATION).toBe('impersonation');
    });

    it('ThemeId has expected values', () => {
      expect(ThemeId.AMBER).toBe('amber');
      expect(ThemeId.PHOSPHOR).toBe('phosphor');
      expect(ThemeId.PATRIOT).toBe('patriot');
    });
  });
});
