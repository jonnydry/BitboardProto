// Test setup file for Vitest
import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// jsdom ArrayBuffers fail Node SubtleCrypto's instanceof checks.
// Copy raw key material into a Node Buffer so importKey works in tests.
const originalImportKey = webcrypto.subtle.importKey.bind(webcrypto.subtle);
Object.defineProperty(webcrypto.subtle, 'importKey', {
  configurable: true,
  value: ((
    format: Parameters<SubtleCrypto['importKey']>[0],
    keyData: Parameters<SubtleCrypto['importKey']>[1],
    algorithm: Parameters<SubtleCrypto['importKey']>[2],
    extractable: Parameters<SubtleCrypto['importKey']>[3],
    keyUsages: Parameters<SubtleCrypto['importKey']>[4],
  ) => {
    if (format === 'raw' && keyData && typeof keyData === 'object') {
      const view = ArrayBuffer.isView(keyData)
        ? new Uint8Array(keyData.buffer, keyData.byteOffset, keyData.byteLength)
        : new Uint8Array(keyData as ArrayBuffer);
      keyData = Buffer.from(Array.from(view));
    }
    return originalImportKey(format, keyData, algorithm, extractable, keyUsages);
  }) as SubtleCrypto['importKey'],
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

// Mock window.matchMedia for components that use it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'crypto', {
  configurable: true,
  writable: true,
  value: webcrypto,
});

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  writable: true,
  value: webcrypto,
});

beforeEach(() => {
  vi.stubGlobal('nostr', undefined);
});
