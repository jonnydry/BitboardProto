import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

async function loadService() {
  vi.resetModules();
  return import('../../services/encryptedBoardService');
}

describe('encryptedBoardService', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('generates unique board keys', async () => {
    const { encryptedBoardService } = await loadService();

    const keyA = await encryptedBoardService.generateBoardKey();
    const keyB = await encryptedBoardService.generateBoardKey();

    expect(keyA).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(keyB).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(keyA).not.toBe(keyB);
  });

  it('stores, loads, lists, and removes board keys', async () => {
    const { encryptedBoardService } = await loadService();

    encryptedBoardService.saveBoardKey('board-1', 'key-one');
    encryptedBoardService.saveBoardKey('board-2', 'key-two');

    expect(encryptedBoardService.getBoardKey('board-1')).toBe('key-one');
    expect(encryptedBoardService.hasBoardKey('board-2')).toBe(true);
    expect(encryptedBoardService.getEncryptedBoardIds().sort()).toEqual(['board-1', 'board-2']);

    const { encryptedBoardService: reloadedService } = await loadService();
    expect(reloadedService.getBoardKey('board-1')).toBe('key-one');

    reloadedService.removeBoardKey('board-1');
    expect(reloadedService.getBoardKey('board-1')).toBeNull();
    expect(reloadedService.hasBoardKey('board-1')).toBe(false);
    expect(reloadedService.getEncryptedBoardIds()).toEqual(['board-2']);
  });

  it('encrypts and decrypts content with real crypto', async () => {
    const { encryptedBoardService } = await loadService();
    const key = await encryptedBoardService.generateBoardKey();
    const plaintext = 'Secret board message with unicode: hello pi ca';

    const encryptedA = await encryptedBoardService.encryptContent(plaintext, key);
    const encryptedB = await encryptedBoardService.encryptContent(plaintext, key);

    expect(encryptedA).not.toBe(plaintext);
    expect(encryptedA).not.toBe(encryptedB);
    await expect(encryptedBoardService.decryptContent(encryptedA, key)).resolves.toBe(plaintext);
    await expect(encryptedBoardService.decryptContent(encryptedB, key)).resolves.toBe(plaintext);
  });

  it('fails decryption with the wrong key', async () => {
    const { encryptedBoardService } = await loadService();
    const keyA = await encryptedBoardService.generateBoardKey();
    const keyB = await encryptedBoardService.generateBoardKey();
    const encrypted = await encryptedBoardService.encryptContent('classified', keyA);

    await expect(encryptedBoardService.decryptContent(encrypted, keyB)).rejects.toThrow();
  });

  it('encrypts and decrypts post payloads', async () => {
    const { encryptedBoardService } = await loadService();
    const key = await encryptedBoardService.generateBoardKey();

    const encrypted = await encryptedBoardService.encryptPost(
      { title: 'Board title', content: 'Board content' },
      key,
    );
    const decrypted = await encryptedBoardService.decryptPost(encrypted, key);

    expect(decrypted).toEqual({ title: 'Board title', content: 'Board content' });
  });

  it('returns fallback content when post decryption fails', async () => {
    const { encryptedBoardService } = await loadService();
    const keyA = await encryptedBoardService.generateBoardKey();
    const keyB = await encryptedBoardService.generateBoardKey();
    const encrypted = await encryptedBoardService.encryptPost(
      { title: 'Board title', content: 'Board content' },
      keyA,
    );

    const decrypted = await encryptedBoardService.decryptPost(encrypted, keyB);

    expect(decrypted).toEqual({
      title: '[Encrypted - Access Required]',
      content: '[This content is encrypted. You need the share link to view it.]',
    });
  });

  it('generates and parses share links', async () => {
    const { encryptedBoardService } = await loadService();
    const key = await encryptedBoardService.generateBoardKey();
    const link = encryptedBoardService.generateShareLink('board-1', key);

    expect(link).toContain('/b/board-1#key=');

    window.history.replaceState(null, '', link);
    expect(encryptedBoardService.parseKeyFromUrl()).toEqual({ boardId: 'board-1', key });
  });

  it('handles share links by saving the key and clearing the hash', async () => {
    const { encryptedBoardService } = await loadService();
    const key = await encryptedBoardService.generateBoardKey();
    const link = encryptedBoardService.generateShareLink('board-9', key);
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    window.history.replaceState(null, '', link);
    const parsed = encryptedBoardService.handleShareLink();

    expect(parsed).toEqual({ boardId: 'board-9', key });
    expect(encryptedBoardService.getBoardKey('board-9')).toBe(key);
    expect(replaceStateSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('imports valid share links and rejects malformed ones', async () => {
    const { encryptedBoardService } = await loadService();
    const key = await encryptedBoardService.generateBoardKey();
    const validLink = encryptedBoardService.generateShareLink('board-import', key);

    expect(encryptedBoardService.importFromShareLink(validLink)).toEqual({
      boardId: 'board-import',
      key,
    });
    expect(encryptedBoardService.getBoardKey('board-import')).toBe(key);

    expect(() => encryptedBoardService.importFromShareLink('https://bitboard.test/b/abc')).toThrow(
      'Invalid share link: missing encryption key',
    );
    expect(() => encryptedBoardService.importFromShareLink('not-a-url')).toThrow(
      'Invalid share link format',
    );
  });

  it('reports availability when web crypto exists', async () => {
    const { encryptedBoardService } = await loadService();
    expect(encryptedBoardService.isAvailable()).toBe(true);
  });
});
