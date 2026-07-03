declare module 'react-syntax-highlighter' {
  import type { FunctionComponent, ReactNode } from 'react';

  export interface SyntaxHighlighterProps {
    language?: string;
    style?: Record<string, unknown>;
    children?: ReactNode;
    [key: string]: unknown;
  }

  // react-syntax-highlighter exports a function-style component that also
  // carries a static `registerLanguage(name, grammar)` method.
  type SyntaxHighlighterFC = FunctionComponent<SyntaxHighlighterProps> & {
    registerLanguage(name: string, grammar: unknown): void;
  };

  const SyntaxHighlighter: SyntaxHighlighterFC;
  export default SyntaxHighlighter;
  // Named re-export used in components/MarkdownRenderer.tsx — these are pulled
  // from react-syntax-highlighter's main entry and re-exported under their own
  // names. The actual values are not type-checked; they're treated as Components.
  export const Prism: SyntaxHighlighterFC;
  export const PrismLight: SyntaxHighlighterFC;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  const styles: Record<string, Record<string, unknown>>;
  export default styles;
  // Allow named imports like `import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'`.
  // The real module exports each style as a named member; the type checker
  // doesn't need to know about every one.
  export const oneDark: Record<string, unknown>;
  export const oneLight: Record<string, unknown>;
  export const tomorrow: Record<string, unknown>;
  export const vscDarkPlus: Record<string, unknown>;
  export const dracula: Record<string, unknown>;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/javascript' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/typescript' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/jsx' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/tsx' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/python' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/rust' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/go' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/bash' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/json' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/css' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/sql' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/markdown' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/yaml' {
  const grammar: unknown;
  export default grammar;
}

declare module 'ngeohash' {
  export function encode(lat: number, lon: number, precision?: number): string;
  export function decode(hash: string): { latitude: number; longitude: number };
  export function decode_int(hash: string): { latitude: number; longitude: number };
  export function encode_int(
    lat: number,
    lon: number,
    precision?: number,
  ): { hash: string; lat_err: number; lon_err: number };
  export function neighbor(hash: string, direction: [number, number]): string;
  export function neighbors(hash: string): string[];
  export function expand(hash: string): string[];
  export const BBOX: Record<string, [number, number, number, number]>;
  export const NEIGHBORS: Record<string, [number, number]>;
  export const BORDERS: Record<string, [number, number]>;
  export const NORTH: 0;
  export const EAST: 1;
  export const SOUTH: 2;
  export const WEST: 3;
}

// NIP-07: window.nostr is injected by browser extensions (Alby, nos2x, etc.)
// We use a structural NostrEvent type (not imported from nostr-tools to avoid
// circular type evaluation) — the consumer is responsible for verifying
// pubkey/id match (see identityService.signEventWithExtension).
interface NIP07Event {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

interface Window {
  nostr?: {
    getPublicKey(): Promise<string>;
    // The NIP-07 spec accepts an UnsignedEvent. The signature returns a
    // signed NIP07Event. We type the input loosely so callers can pass any
    // structurally-compatible object.
    signEvent(event: {
      kind: number;
      created_at: number;
      tags: string[][];
      content: string;
    }): Promise<NIP07Event>;
    getRelays?: () => Promise<Record<string, { read: boolean; write: boolean }>>;
    nip04?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>;
      decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
    nip44?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>;
      decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
  };
}
