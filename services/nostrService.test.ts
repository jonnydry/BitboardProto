import { describe, expect, it, vi } from 'vitest';
import type { NostrEvent } from '../types';

// Mock nostr-tools to avoid real websocket/pool behavior in unit tests.
let failingRelays = new Set<string>();

vi.mock('nostr-tools', () => {
  class SimplePool {
    querySync() {
      return Promise.resolve([]);
    }

    publish(relays: string[]) {
      const url = relays[0];
      if (failingRelays.has(url)) {
        return Promise.reject(new Error(`Publish failed for ${url}`));
      }
      return Promise.resolve();
    }

    subscribeMany() {
      return { close() {} };
    }
  }

  return {
    SimplePool,
  };
});

import { nostrService } from './nostrService';

function makeEvent(partial: Partial<NostrEvent>): NostrEvent {
  return {
    id: partial.id ?? 'evt1',
    pubkey: partial.pubkey ?? 'pubkey1',
    kind: partial.kind ?? 1,
    created_at: partial.created_at ?? Math.floor(Date.now() / 1000),
    tags: partial.tags ?? [],
    content: partial.content ?? '',
    sig: partial.sig ?? 'sig',
  };
}

describe('nostrService post edit events', () => {
  it('does not treat explicit post_edit events as comments', () => {
    const rootId = 'root123';
    const edit = makeEvent({
      id: 'edit1',
      tags: [
        ['client', 'bitboard'],
        ['bb', 'post_edit'],
        ['e', rootId, '', 'edit'],
        ['title', 'New title'],
        ['board', 'b-tech'],
      ],
      content: 'updated',
    });

    expect(nostrService.isBitboardPostEditEvent(edit)).toBe(true);
    expect(nostrService.isBitboardCommentEvent(edit, rootId)).toBe(false);
    expect(nostrService.isBitboardPostEvent(edit)).toBe(false);
  });

  it('parses post edit updates and sanitizes URLs', () => {
    const rootId = 'root123';
    const edit = makeEvent({
      id: 'edit2',
      tags: [
        ['client', 'bitboard'],
        ['bb', 'post_edit'],
        ['e', rootId, '', 'edit'],
        ['title', 'Hello'],
        ['board', 'b-tech'],
        ['r', 'javascript:alert(1)'],
        ['image', 'https://example.com/img.png'],
        ['t', 'valid_tag'],
        ['t', 'INVALID TAG'],
      ],
      content: 'content',
    });

    const parsed = nostrService.eventToPostEditUpdate(edit);
    expect(parsed?.rootPostEventId).toBe(rootId);
    expect(parsed?.updates.title).toBe('Hello');
    expect(parsed?.updates.url).toBeUndefined();
    expect(parsed?.updates.imageUrl).toBe('https://example.com/img.png');
    expect(parsed?.updates.tags).toEqual(['valid_tag']);
  });
});

describe('nostrService publishSignedEvent', () => {
  it('attempts publish even when statuses start disconnected', async () => {
    // Ensure relays exist in this test run
    nostrService.setRelays(['wss://relay-a.test', 'wss://relay-b.test']);

    const evt = makeEvent({
      id: 'publish1',
      tags: [['client', 'bitboard'], ['bb', 'post'], ['title', 't'], ['board', 'b-tech']],
      content: 'c',
    });

    await expect(nostrService.publishSignedEvent(evt)).resolves.toBe(evt);

    const statuses = nostrService.getRelayStatuses();
    const a = statuses.find((s) => s.url === 'wss://relay-a.test');
    const b = statuses.find((s) => s.url === 'wss://relay-b.test');

    expect(a?.isConnected).toBe(true);
    expect(b?.isConnected).toBe(true);
  });

  it('succeeds if at least one relay publishes; marks failing relay error', async () => {
    failingRelays = new Set(['wss://relay-b.test']);
    nostrService.setRelays(['wss://relay-a.test', 'wss://relay-b.test']);

    const evt = makeEvent({
      id: 'publish2',
      tags: [['client', 'bitboard'], ['bb', 'post'], ['title', 't'], ['board', 'b-tech']],
      content: 'c',
    });

    await expect(nostrService.publishSignedEvent(evt)).resolves.toBe(evt);

    const statuses = nostrService.getRelayStatuses();
    const a = statuses.find((s) => s.url === 'wss://relay-a.test');
    const b = statuses.find((s) => s.url === 'wss://relay-b.test');

    expect(a?.isConnected).toBe(true);
    expect(b?.isConnected).toBe(false);
    expect(b?.lastError).toBeTruthy();
  });
});
