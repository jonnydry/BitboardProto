import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { eventToPost } from '../../services/nostr/eventTransforms';

describe('eventToPost geohash notes', () => {
  it('maps untitled BitChat location notes onto a geo board', () => {
    const event: NostrEvent = {
      id: 'note-1',
      pubkey: 'b'.repeat(64),
      created_at: 1_700_000_000,
      kind: 1,
      tags: [
        ['g', 'dr5regw'],
        ['n', 'alice'],
      ],
      content: 'Coffee on the corner\nBring cash',
      sig: 'sig',
    };

    const post = eventToPost(event, () => 'fallback');
    expect(post.boardId).toBe('geo-dr5regw');
    expect(post.source).toBe('nostr');
    expect(post.title).toBe('Coffee on the corner');
    expect(post.author).toBe('alice');
    expect(post.content).toContain('Coffee on the corner');
  });
});
