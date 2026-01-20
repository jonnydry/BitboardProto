/**
 * Test file to verify all new services can be imported and have expected exports
 */
import { describe, it, expect } from 'vitest';

describe('New Services Import Verification', () => {
  it('articleService imports and has expected exports', async () => {
    const module = await import('../services/articleService');
    
    // Check singleton export
    expect(module.articleService).toBeDefined();
    expect(typeof module.articleService.buildArticleEvent).toBe('function');
    expect(typeof module.articleService.parseArticle).toBe('function');
    expect(typeof module.articleService.fetchArticle).toBe('function');
    expect(typeof module.articleService.fetchArticlesByAuthor).toBe('function');
    expect(typeof module.articleService.fetchArticlesForBoard).toBe('function');
    expect(typeof module.articleService.fetchRecentArticles).toBe('function');
    expect(typeof module.articleService.fetchArticlesByHashtag).toBe('function');
    expect(typeof module.articleService.getArticleAddress).toBe('function');
    expect(typeof module.articleService.parseArticleAddress).toBe('function');
    expect(typeof module.articleService.generateSlug).toBe('function');
    expect(typeof module.articleService.clearCache).toBe('function');
    expect(typeof module.articleService.invalidateArticle).toBe('function');
    
    // Check class export
    expect(module.ArticleService).toBeDefined();
  });

  it('badgeService imports and has expected exports', async () => {
    const module = await import('../services/badgeService');
    
    // Check singleton export
    expect(module.badgeService).toBeDefined();
    expect(typeof module.badgeService.buildBadgeDefinition).toBe('function');
    expect(typeof module.badgeService.parseBadgeDefinition).toBe('function');
    expect(typeof module.badgeService.fetchBadgeDefinition).toBe('function');
    expect(typeof module.badgeService.buildBadgeAward).toBe('function');
    expect(typeof module.badgeService.parseBadgeAward).toBe('function');
    expect(typeof module.badgeService.fetchBadgesForUser).toBe('function');
    expect(typeof module.badgeService.buildProfileBadges).toBe('function');
    expect(typeof module.badgeService.parseProfileBadges).toBe('function');
    expect(typeof module.badgeService.fetchProfileBadges).toBe('function');
    expect(typeof module.badgeService.getUserBadgeInfo).toBe('function');
    expect(typeof module.badgeService.getDisplayedBadges).toBe('function');
    expect(typeof module.badgeService.clearCache).toBe('function');
    
    // Check class export
    expect(module.BadgeService).toBeDefined();
    
    // Check BITBOARD_BADGES constant
    expect(module.BITBOARD_BADGES).toBeDefined();
    expect(module.BITBOARD_BADGES.FOUNDING_MEMBER).toBe('bitboard-founding-member');
    expect(module.BITBOARD_BADGES.TOP_CONTRIBUTOR).toBe('bitboard-top-contributor');
  });

  it('communityService imports and has expected exports', async () => {
    const module = await import('../services/communityService');
    
    // Check singleton export
    expect(module.communityService).toBeDefined();
    expect(typeof module.communityService.buildCommunityDefinition).toBe('function');
    expect(typeof module.communityService.parseCommunityDefinition).toBe('function');
    expect(typeof module.communityService.fetchCommunity).toBe('function');
    expect(typeof module.communityService.fetchCommunities).toBe('function');
    expect(typeof module.communityService.buildPostApproval).toBe('function');
    expect(typeof module.communityService.parsePostApproval).toBe('function');
    expect(typeof module.communityService.fetchApprovalsForCommunity).toBe('function');
    expect(typeof module.communityService.isPostApproved).toBe('function');
    expect(typeof module.communityService.getApprovedPostIds).toBe('function');
    expect(typeof module.communityService.isModerator).toBe('function');
    expect(typeof module.communityService.getCommunityAddress).toBe('function');
    expect(typeof module.communityService.clearCache).toBe('function');
    
    // Check class export
    expect(module.CommunityService).toBeDefined();
  });

  it('listService imports and has expected exports', async () => {
    const module = await import('../services/listService');
    
    // Check singleton export
    expect(module.listService).toBeDefined();
    expect(typeof module.listService.setUserPubkey).toBe('function');
    expect(typeof module.listService.buildListEvent).toBe('function');
    expect(typeof module.listService.buildMuteList).toBe('function');
    expect(typeof module.listService.buildBookmarksList).toBe('function');
    expect(typeof module.listService.buildCategorizedBookmarks).toBe('function');
    expect(typeof module.listService.buildCategorizedPeople).toBe('function');
    expect(typeof module.listService.parseListEvent).toBe('function');
    expect(typeof module.listService.fetchMuteList).toBe('function');
    expect(typeof module.listService.fetchBookmarks).toBe('function');
    expect(typeof module.listService.fetchNamedList).toBe('function');
    expect(typeof module.listService.fetchAllNamedLists).toBe('function');
    expect(typeof module.listService.isMuted).toBe('function');
    expect(typeof module.listService.isBookmarked).toBe('function');
    expect(typeof module.listService.clearCache).toBe('function');
    
    // Check class export
    expect(module.ListService).toBeDefined();
    
    // Check LIST_KINDS constant
    expect(module.LIST_KINDS).toBeDefined();
    expect(module.LIST_KINDS.MUTE).toBe(10000);
    expect(module.LIST_KINDS.BOOKMARKS).toBe(10003);
  });

  it('liveEventService imports and has expected exports', async () => {
    const module = await import('../services/liveEventService');
    
    // Check singleton export
    expect(module.liveEventService).toBeDefined();
    expect(typeof module.liveEventService.buildLiveEvent).toBe('function');
    expect(typeof module.liveEventService.buildLiveChatMessage).toBe('function');
    expect(typeof module.liveEventService.parseLiveEvent).toBe('function');
    expect(typeof module.liveEventService.parseLiveChatMessage).toBe('function');
    expect(typeof module.liveEventService.fetchLiveEvent).toBe('function');
    expect(typeof module.liveEventService.fetchLiveNow).toBe('function');
    expect(typeof module.liveEventService.fetchUpcoming).toBe('function');
    expect(typeof module.liveEventService.fetchPastEvents).toBe('function');
    expect(typeof module.liveEventService.fetchChatMessages).toBe('function');
    expect(typeof module.liveEventService.subscribeToChatMessages).toBe('function');
    expect(typeof module.liveEventService.getLiveEventAddress).toBe('function');
    expect(typeof module.liveEventService.parseLiveEventAddress).toBe('function');
    expect(typeof module.liveEventService.clearCache).toBe('function');
    expect(typeof module.liveEventService.cleanup).toBe('function');
    
    // Check class export
    expect(module.LiveEventService).toBeDefined();
  });

  it('wotService imports and has expected exports', async () => {
    const module = await import('../services/wotService');
    
    // Check singleton export
    expect(module.wotService).toBeDefined();
    expect(typeof module.wotService.setUserPubkey).toBe('function');
    expect(typeof module.wotService.getUserPubkey).toBe('function');
    expect(typeof module.wotService.fetchContactList).toBe('function');
    expect(typeof module.wotService.fetchContactLists).toBe('function');
    expect(typeof module.wotService.buildWoTGraph).toBe('function');
    expect(typeof module.wotService.getScore).toBe('function');
    expect(typeof module.wotService.getDistance).toBe('function');
    expect(typeof module.wotService.isWithinDistance).toBe('function');
    expect(typeof module.wotService.isTrusted).toBe('function');
    expect(typeof module.wotService.filterTrusted).toBe('function');
    expect(typeof module.wotService.getScores).toBe('function');
    expect(typeof module.wotService.filterPostsByWoT).toBe('function');
    expect(typeof module.wotService.sortPostsByWoT).toBe('function');
    expect(typeof module.wotService.areMutualFollows).toBe('function');
    expect(typeof module.wotService.getMutualFollows).toBe('function');
    expect(typeof module.wotService.clearCache).toBe('function');
    expect(typeof module.wotService.getCacheStats).toBe('function');
    
    // Check class export
    expect(module.WoTService).toBeDefined();
  });

  it('zapService imports and has expected exports', async () => {
    const module = await import('../services/zapService');
    
    // Check singleton export
    expect(module.zapService).toBeDefined();
    expect(typeof module.zapService.parseLightningAddress).toBe('function');
    expect(typeof module.zapService.canReceiveZaps).toBe('function');
    expect(typeof module.zapService.fetchLNURLPayInfo).toBe('function');
    expect(typeof module.zapService.getZapInvoice).toBe('function');
    expect(typeof module.zapService.buildZapRequest).toBe('function');
    expect(typeof module.zapService.parseZapReceipt).toBe('function');
    expect(typeof module.zapService.fetchZapsForEvent).toBe('function');
    expect(typeof module.zapService.getZapTally).toBe('function');
    expect(typeof module.zapService.getZapTalliesForEvents).toBe('function');
    expect(typeof module.zapService.subscribeToZaps).toBe('function');
    expect(typeof module.zapService.getSuggestedAmounts).toBe('function');
    expect(typeof module.zapService.formatSats).toBe('function');
    expect(typeof module.zapService.clearCache).toBe('function');
    expect(typeof module.zapService.invalidateEventCache).toBe('function');
    
    // Check class export
    expect(module.ZapService).toBeDefined();
  });
});

describe('Service No Side Effects on Import', () => {
  it('services should not throw on import', async () => {
    // These should import without side effects or errors
    await expect(import('../services/articleService')).resolves.toBeDefined();
    await expect(import('../services/badgeService')).resolves.toBeDefined();
    await expect(import('../services/communityService')).resolves.toBeDefined();
    await expect(import('../services/listService')).resolves.toBeDefined();
    await expect(import('../services/liveEventService')).resolves.toBeDefined();
    await expect(import('../services/wotService')).resolves.toBeDefined();
    await expect(import('../services/zapService')).resolves.toBeDefined();
  });
});
