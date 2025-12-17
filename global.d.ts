import type { NostrEvent, UnsignedNostrEvent } from './types';

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: UnsignedNostrEvent) => Promise<NostrEvent>;
    };
  }
}

export {};

