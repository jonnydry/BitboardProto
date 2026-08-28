import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  isGeohashChannelEvent,
  isLocalChannelPostEvent,
} from '../../services/nostr/eventHelpers';

function event(partial: Partial<NostrEvent> & Pick<NostrEvent, 'tags' | 'content'>): NostrEvent {
  return {
    id: partial.id || 'evt-1',
    pubkey: partial.pubkey || 'a'.repeat(64),
    created_at: partial.created_at || 1,
    kind: partial.kind ?? 1,
    tags: partial.tags,
    content: partial.content,
    sig: partial.sig || 'sig',
  };
}

describe('geohash channel event helpers', () => {
  it('accepts BitChat-style kind-1 notes with a g tag', () => {
    const note = event({
      tags: [
        ['g', 'dr5regw'],
        ['n', 'alice'],
      ],
      content: 'hello from the cell',
    });
    expect(isGeohashChannelEvent(note)).toBe(true);
    expect(isLocalChannelPostEvent(note)).toBe(true);
  });

  it('rejects replies so chat threads are not top-level posts', () => {
    const reply = event({
      tags: [
        ['g', 'dr5regw'],
        ['e', 'root-id', '', 'root'],
      ],
      content: 'reply',
    });
    expect(isGeohashChannelEvent(reply)).toBe(false);
  });

  it('filters by search cell set case-insensitively', () => {
    const note = event({
      tags: [['g', 'DR5REGW']],
      content: 'here',
    });
    expect(isGeohashChannelEvent(note, ['dr5regw', 'neighbor'])).toBe(true);
    expect(isGeohashChannelEvent(note, ['zzzzzzz'])).toBe(false);
  });

  it('rejects notes without a g tag', () => {
    const note = event({
      tags: [['client', 'bitboard']],
      content: 'not local',
    });
    expect(isGeohashChannelEvent(note)).toBe(false);
  });
});
