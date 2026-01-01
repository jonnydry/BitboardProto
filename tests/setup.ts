// Test setup file for Vitest
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia for components that use it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
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

// Mock Web Crypto API for crypto service tests
const mockCrypto = {
  subtle: {
    generateKey: vi.fn().mockResolvedValue({
      type: 'secret',
      algorithm: { name: 'AES-GCM', length: 256 },
    }),
    exportKey: vi.fn().mockImplementation(async (_format, _key) => {
      // Return a mock 256-bit key (32 bytes)
      return new Uint8Array(32).fill(1);
    }),
    importKey: vi.fn().mockResolvedValue({
      type: 'secret',
      algorithm: { name: 'AES-GCM', length: 256 },
    }),
    encrypt: vi.fn().mockImplementation(async (algorithm, key, data) => {
      // Simple mock: just return the data with a prefix
      const prefix = new Uint8Array([0, 1, 2, 3]);
      const combined = new Uint8Array(prefix.length + data.byteLength);
      combined.set(prefix);
      combined.set(new Uint8Array(data), prefix.length);
      return combined.buffer;
    }),
    decrypt: vi.fn().mockImplementation(async (algorithm, key, data) => {
      // Simple mock: strip the prefix and return
      const dataArray = new Uint8Array(data);
      return dataArray.slice(4).buffer;
    }),
  },
  getRandomValues: vi.fn().mockImplementation((array) => {
    // Fill with deterministic values for testing
    for (let i = 0; i < array.length; i++) {
      array[i] = i % 256;
    }
    return array;
  }),
};

Object.defineProperty(window, 'crypto', {
  writable: true,
  value: mockCrypto,
});

Object.defineProperty(global, 'crypto', {
  writable: true,
  value: mockCrypto,
});



