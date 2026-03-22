import { describe, expect, it, vi } from 'vitest';
import { ViewMode } from '../../types';
import { navigateFromNotificationDeepLink } from '../../features/layout/appDeepLinks';

function makeActions() {
  return {
    setActiveBoardId: vi.fn(),
    setSelectedBitId: vi.fn(),
    setProfileUser: vi.fn(),
    setViewMode: vi.fn(),
  };
}

describe('navigateFromNotificationDeepLink', () => {
  it('navigates to a post detail and preserves board context', () => {
    const actions = makeActions();

    navigateFromNotificationDeepLink(
      { viewMode: ViewMode.SINGLE_BIT, postId: 'post-1', boardId: 'b-tech' },
      actions,
    );

    expect(actions.setActiveBoardId).toHaveBeenCalledWith('b-tech');
    expect(actions.setSelectedBitId).toHaveBeenCalledWith('post-1');
    expect(actions.setViewMode).toHaveBeenCalledWith(ViewMode.SINGLE_BIT);
  });

  it('navigates to a profile with a fallback username', () => {
    const actions = makeActions();
    const pubkey = 'a'.repeat(64);

    navigateFromNotificationDeepLink({ viewMode: ViewMode.USER_PROFILE, pubkey }, actions);

    expect(actions.setProfileUser).toHaveBeenCalledWith({
      username: 'aaaaaaaa...',
      pubkey,
    });
    expect(actions.setViewMode).toHaveBeenCalledWith(ViewMode.USER_PROFILE);
  });
});
