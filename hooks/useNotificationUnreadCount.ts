import { useEffect, useState } from 'react';
import { notificationService } from '../services/notificationService';

export function useNotificationUnreadCount(): number {
  const [unreadCount, setUnreadCount] = useState(() => notificationService.getUnreadCount());

  useEffect(() => {
    const updateCount = () => {
      setUnreadCount(notificationService.getUnreadCount());
    };

    updateCount();
    return notificationService.subscribe(updateCount);
  }, []);

  return unreadCount;
}
