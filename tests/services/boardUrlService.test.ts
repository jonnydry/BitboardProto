import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildBoardPathname,
  GLOBAL_BOARD_SENTINEL,
  parseBoardIdFromPathname,
  persistLastActiveBoardId,
  readLastBoardPreference,
} from '../../services/boardUrlService';
import { StorageKeys } from '../../config';

describe('boardUrlService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('parses board id from /board/ prefix', () => {
    expect(parseBoardIdFromPathname('/board/b-tech')).toBe('b-tech');
    expect(parseBoardIdFromPathname('/board/gh-abc')).toBe('gh-abc');
  });

  it('buildBoardPathname encodes segments', () => {
    expect(buildBoardPathname('b-tech')).toBe('/board/b-tech');
  });

  it('persists global sentinel and reads it back', () => {
    persistLastActiveBoardId(null);
    expect(localStorage.getItem(StorageKeys.LAST_ACTIVE_BOARD_ID)).toBe(GLOBAL_BOARD_SENTINEL);
    expect(readLastBoardPreference()).toBe('global');

    persistLastActiveBoardId('b-news');
    expect(readLastBoardPreference()).toBe('b-news');
  });
});
