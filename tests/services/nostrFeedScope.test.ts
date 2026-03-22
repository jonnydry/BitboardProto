import { describe, it, expect } from 'vitest';
import { BoardType } from '../../types';
import { NOSTR_KINDS } from '../../types';
import { buildFetchPostsArgs, resolveNostrFeedScope } from '../../services/nostr/nostrFeedScope';
import type { Board } from '../../types';

const topicTech: Board = {
  id: 'b-tech',
  name: 'TECH',
  description: 'Tech',
  isPublic: true,
  memberCount: 1,
  type: BoardType.TOPIC,
};

const nipBoard: Board = {
  id: 'my-board',
  name: 'Mine',
  description: 'd',
  isPublic: true,
  memberCount: 1,
  type: BoardType.TOPIC,
  createdBy: 'abc'.repeat(22),
};

const geoBoard: Board = {
  id: 'g1',
  name: 'Here',
  description: 'x',
  isPublic: true,
  memberCount: 1,
  type: BoardType.GEOHASH,
  geohash: '9q8yy',
};

const communityBoard: Board = {
  id: 'ext-1',
  name: 'Ext',
  description: 'x',
  isPublic: true,
  memberCount: 1,
  type: BoardType.TOPIC,
  source: 'nostr-community',
};

describe('resolveNostrFeedScope', () => {
  it('returns global when no active board', () => {
    expect(resolveNostrFeedScope(null)).toEqual({ mode: 'global' });
  });

  it('maps default //TECH-style board to #board id', () => {
    const s = resolveNostrFeedScope(topicTech);
    expect(s).toEqual({
      mode: 'scoped',
      fetch: { boardId: 'b-tech' },
      subscribe: { boardId: 'b-tech' },
    });
  });

  it('uses NIP-33 address when createdBy is set', () => {
    const s = resolveNostrFeedScope(nipBoard);
    const addr = `${NOSTR_KINDS.BOARD_DEFINITION}:${nipBoard.createdBy}:${nipBoard.id}`;
    expect(s).toEqual({
      mode: 'scoped',
      fetch: { boardAddress: addr },
      subscribe: { boardAddress: addr },
    });
  });

  it('uses geohash for GEOHASH boards', () => {
    const s = resolveNostrFeedScope(geoBoard);
    expect(s).toEqual({
      mode: 'scoped',
      fetch: { geohash: '9q8yy' },
      subscribe: { geohash: '9q8yy' },
    });
  });

  it('skips standard feed for nostr-community', () => {
    expect(resolveNostrFeedScope(communityBoard)).toEqual({ mode: 'community' });
  });
});

describe('buildFetchPostsArgs', () => {
  it('merges paging with scoped board id', () => {
    const scope = resolveNostrFeedScope(topicTech);
    expect(buildFetchPostsArgs(scope, { limit: 25, until: 1700000000 })).toEqual({
      limit: 25,
      until: 1700000000,
      boardId: 'b-tech',
    });
  });

  it('omits board filters for global scope', () => {
    const scope = resolveNostrFeedScope(null);
    expect(buildFetchPostsArgs(scope, { limit: 50 })).toEqual({ limit: 50 });
  });
});
