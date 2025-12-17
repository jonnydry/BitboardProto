// Test utilities and helpers for BitBoard tests
import type { Post, Board, UserState, NostrIdentity } from '../../types';
import { BoardType } from '../../types';

/**
 * Create a mock Nostr identity for testing
 */
export function createMockIdentity(overrides?: Partial<NostrIdentity>): NostrIdentity {
  return {
    kind: 'local',
    pubkey: 'a'.repeat(64),
    privkey: 'b'.repeat(64),
    displayName: 'Test User',
    ...overrides,
  };
}

/**
 * Create a mock user state for testing
 */
export function createMockUserState(overrides?: Partial<UserState>): UserState {
  return {
    username: 'testuser',
    hasIdentity: true,
    identity: createMockIdentity(),
    votedPosts: {},
    bits: 100,
    ...overrides,
  };
}

/**
 * Create a mock board for testing
 */
export function createMockBoard(overrides?: Partial<Board>): Board {
  return {
    id: 'test-board-1',
    name: 'Test Board',
    description: 'A test board',
    type: BoardType.TOPIC,
    isPublic: true,
    isEncrypted: false,
    memberCount: 1,
    createdBy: 'a'.repeat(64),
    ...overrides,
  };
}

/**
 * Create a mock post for testing
 */
export function createMockPost(overrides?: Partial<Post>): Post {
  return {
    id: `post-${Date.now()}`,
    title: 'Test Post',
    content: 'This is a test post',
    author: 'testuser',
    authorPubkey: 'a'.repeat(64),
    timestamp: Date.now(),
    boardId: 'test-board-1',
    tags: ['test'],
    upvotes: 0,
    downvotes: 0,
    score: 0,
    commentCount: 0,
    comments: [],
    ...overrides,
  };
}

/**
 * Wait for a specified amount of time (for async testing)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mock localStorage for testing
 */
export class MockLocalStorage {
  private store: Record<string, string> = {};

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }
}

