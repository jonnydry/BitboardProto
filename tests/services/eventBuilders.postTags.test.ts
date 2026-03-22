import { describe, it, expect } from 'vitest';
import { buildPostEvent } from '../../services/nostr/eventBuilders';
import { BITBOARD_TYPE_POST, BITBOARD_TYPE_TAG } from '../../services/nostr/bitboardEventTypes';

describe('buildPostEvent (BitBoard → Nostr tags)', () => {
  const pubkey = 'a'.repeat(64);

  it('tags //TECH posts with client bitboard, bb post, and board b-tech', () => {
    const unsigned = buildPostEvent(
      {
        boardId: 'b-tech',
        title: 'Hello',
        content: 'Body',
        author: 'me',
        authorPubkey: pubkey,
        tags: [],
        url: undefined,
        imageUrl: undefined,
        linkDescription: undefined,
        timestamp: Date.now(),
      },
      pubkey,
      undefined,
      { boardName: 'TECH' },
    );

    expect(unsigned.tags).toContainEqual(['client', 'bitboard']);
    expect(unsigned.tags).toContainEqual([BITBOARD_TYPE_TAG, BITBOARD_TYPE_POST]);
    expect(unsigned.tags).toContainEqual(['board', 'b-tech']);
    expect(unsigned.tags).toContainEqual(['title', 'Hello']);
    expect(unsigned.content).toBe('Body');
    const tTags = unsigned.tags.filter((t) => t[0] === 't').map((t) => t[1]);
    expect(tTags).toContain('tech');
  });

  it('adds NIP-33 a tag when boardAddress is provided', () => {
    const boardAddress = '30001:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:my-d';
    const unsigned = buildPostEvent(
      {
        boardId: 'my-d',
        title: 'T',
        content: 'C',
        author: 'me',
        authorPubkey: pubkey,
        tags: [],
        timestamp: Date.now(),
      },
      pubkey,
      undefined,
      { boardAddress, boardName: 'Mine' },
    );

    expect(unsigned.tags).toContainEqual(['a', boardAddress]);
    expect(unsigned.tags).toContainEqual(['board', 'my-d']);
  });
});
