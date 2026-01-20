/**
 * Test file to verify NostrService has all expected methods from recent additions
 */
import { describe, it, expect } from 'vitest';
import { nostrService } from '../services/nostr/NostrService';

describe('NostrService New Methods', () => {
  describe('NIP-23 Long-form Articles', () => {
    it('has article fetch methods', () => {
      expect(typeof nostrService.fetchArticle).toBe('function');
      expect(typeof nostrService.fetchArticlesByAuthor).toBe('function');
      expect(typeof nostrService.fetchArticlesForBoard).toBe('function');
      expect(typeof nostrService.fetchRecentArticles).toBe('function');
      expect(typeof nostrService.fetchArticlesByHashtag).toBe('function');
    });
  });

  describe('NIP-51 Lists', () => {
    it('has list fetch methods', () => {
      expect(typeof nostrService.fetchList).toBe('function');
      expect(typeof nostrService.fetchNamedList).toBe('function');
      expect(typeof nostrService.fetchAllNamedLists).toBe('function');
    });
  });

  describe('NIP-53 Live Events', () => {
    it('has live event methods', () => {
      expect(typeof nostrService.fetchLiveEvent).toBe('function');
      expect(typeof nostrService.fetchLiveEvents).toBe('function');
      expect(typeof nostrService.fetchLiveChatMessages).toBe('function');
      expect(typeof nostrService.subscribeToLiveChat).toBe('function');
    });
  });

  describe('NIP-57 Zaps', () => {
    it('has zap methods', () => {
      expect(typeof nostrService.fetchZapReceipts).toBe('function');
      expect(typeof nostrService.fetchZapReceiptsForEvents).toBe('function');
      expect(typeof nostrService.fetchZapsForPubkey).toBe('function');
      expect(typeof nostrService.subscribeToZapReceipts).toBe('function');
    });
  });

  describe('NIP-58 Badges', () => {
    it('has badge methods', () => {
      expect(typeof nostrService.fetchBadgeDefinitions).toBe('function');
      expect(typeof nostrService.fetchBadgeDefinition).toBe('function');
      expect(typeof nostrService.fetchBadgeAwards).toBe('function');
      expect(typeof nostrService.fetchProfileBadges).toBe('function');
    });
  });

  describe('NIP-72 Communities', () => {
    it('has community methods', () => {
      expect(typeof nostrService.fetchCommunityDefinition).toBe('function');
      expect(typeof nostrService.fetchCommunities).toBe('function');
      expect(typeof nostrService.fetchCommunityApprovals).toBe('function');
      expect(typeof nostrService.subscribeToCommunityApprovals).toBe('function');
    });
  });

  describe('NIP-50 Search', () => {
    it('has search methods', () => {
      expect(typeof nostrService.searchRelays).toBe('function');
      expect(typeof nostrService.searchByHashtag).toBe('function');
    });
  });

  describe('NIP-65 Relay Lists', () => {
    it('has relay list methods', () => {
      expect(typeof nostrService.buildRelayListEvent).toBe('function');
      expect(typeof nostrService.fetchRelayListEvent).toBe('function');
    });
  });

  describe('NIP-02 Contact Lists', () => {
    it('has contact list methods', () => {
      expect(typeof nostrService.fetchContactListEvent).toBe('function');
      expect(typeof nostrService.parseContactList).toBe('function');
      expect(typeof nostrService.buildContactListEvent).toBe('function');
    });
  });
});

describe('NostrService Existing Methods (Regression)', () => {
  describe('Core Post Methods', () => {
    it('has post methods', () => {
      expect(typeof nostrService.fetchPosts).toBe('function');
      expect(typeof nostrService.buildPostEvent).toBe('function');
      expect(typeof nostrService.buildPostEditEvent).toBe('function');
      expect(typeof nostrService.buildPostDeleteEvent).toBe('function');
      expect(typeof nostrService.eventToPost).toBe('function');
    });
  });

  describe('Comment Methods', () => {
    it('has comment methods', () => {
      expect(typeof nostrService.fetchComments).toBe('function');
      expect(typeof nostrService.buildCommentEvent).toBe('function');
      expect(typeof nostrService.buildCommentEditEvent).toBe('function');
      expect(typeof nostrService.buildCommentDeleteEvent).toBe('function');
      expect(typeof nostrService.eventToComment).toBe('function');
    });
  });

  describe('Board Methods', () => {
    it('has board methods', () => {
      expect(typeof nostrService.fetchBoards).toBe('function');
      expect(typeof nostrService.buildBoardEvent).toBe('function');
      expect(typeof nostrService.eventToBoard).toBe('function');
    });
  });

  describe('Vote Methods', () => {
    it('has vote methods', () => {
      expect(typeof nostrService.fetchVoteEvents).toBe('function');
      expect(typeof nostrService.fetchVotesForPost).toBe('function');
      expect(typeof nostrService.buildVoteEvent).toBe('function');
    });
  });

  describe('Profile Methods', () => {
    it('has profile methods', () => {
      expect(typeof nostrService.fetchProfiles).toBe('function');
      expect(typeof nostrService.buildProfileEvent).toBe('function');
      expect(typeof nostrService.getDisplayName).toBe('function');
      expect(typeof nostrService.clearProfileCache).toBe('function');
    });
  });

  describe('Relay Management', () => {
    it('has relay methods', () => {
      expect(typeof nostrService.getRelays).toBe('function');
      expect(typeof nostrService.setRelays).toBe('function');
      expect(typeof nostrService.getUserRelays).toBe('function');
      expect(typeof nostrService.setUserRelays).toBe('function');
      expect(typeof nostrService.isConnected).toBe('function');
      expect(typeof nostrService.getConnectedCount).toBe('function');
      expect(typeof nostrService.preconnect).toBe('function');
    });
  });

  describe('Subscription Methods', () => {
    it('has subscription methods', () => {
      expect(typeof nostrService.subscribeToFeed).toBe('function');
      expect(typeof nostrService.subscribeToPostEdits).toBe('function');
      expect(typeof nostrService.unsubscribe).toBe('function');
      expect(typeof nostrService.unsubscribeAll).toBe('function');
    });
  });

  describe('Publishing', () => {
    it('has publish methods', () => {
      expect(typeof nostrService.publishSignedEvent).toBe('function');
    });
  });

  describe('Utility Methods', () => {
    it('has utility methods', () => {
      expect(typeof nostrService.cleanup).toBe('function');
      expect(typeof nostrService.getNetworkStatus).toBe('function');
      expect(typeof nostrService.getQueuedMessageCount).toBe('function');
    });
  });
});
