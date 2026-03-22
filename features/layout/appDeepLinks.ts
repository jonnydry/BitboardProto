import { ViewMode } from '../../types';
import type { Notification } from '../../services/notificationService';

type AppDeepLinkActions = {
  setActiveBoardId: (boardId: string | null) => void;
  setSelectedBitId: (postId: string | null) => void;
  setProfileUser: (user: { username: string; pubkey?: string }) => void;
  setViewMode: (viewMode: ViewMode) => void;
};

export function navigateFromNotificationDeepLink(
  deepLink: Notification['deepLink'],
  actions: AppDeepLinkActions,
): void {
  if (!deepLink?.viewMode) return;

  if (deepLink.viewMode === ViewMode.SINGLE_BIT && deepLink.postId) {
    if (deepLink.boardId) {
      actions.setActiveBoardId(deepLink.boardId);
    }
    actions.setSelectedBitId(deepLink.postId);
    actions.setViewMode(ViewMode.SINGLE_BIT);
    return;
  }

  if (deepLink.viewMode === ViewMode.USER_PROFILE && deepLink.pubkey) {
    actions.setProfileUser({
      username: `${deepLink.pubkey.slice(0, 8)}...`,
      pubkey: deepLink.pubkey,
    });
    actions.setViewMode(ViewMode.USER_PROFILE);
    return;
  }

  if (Object.values(ViewMode).includes(deepLink.viewMode as ViewMode)) {
    actions.setViewMode(deepLink.viewMode as ViewMode);
  }
}
