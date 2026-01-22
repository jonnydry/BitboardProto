import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCw, X, CloudOff, Upload } from 'lucide-react';
import { nostrService } from '../services/nostr/NostrService';

interface OfflineBannerProps {
  isNostrConnected: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isNostrConnected }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [lastSyncedCount, setLastSyncedCount] = useState(0);
  const [showSyncedNotification, setShowSyncedNotification] = useState(false);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsDismissed(false); // Reset dismiss when coming back online
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsDismissed(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Track pending messages from NostrService
  useEffect(() => {
    const checkPendingMessages = () => {
      // Access pending message count from nostrService
      const count = nostrService.getQueuedMessageCount?.() || 0;

      // Check if we just synced some messages
      if (pendingCount > 0 && count < pendingCount) {
        const syncedCount = pendingCount - count;
        setLastSyncedCount(syncedCount);
        setShowSyncedNotification(true);

        // Hide synced notification after 3 seconds
        setTimeout(() => {
          setShowSyncedNotification(false);
        }, 3000);
      }

      setPendingCount(count);
    };

    // Check immediately
    checkPendingMessages();

    // Check every 2 seconds
    const interval = setInterval(checkPendingMessages, 2000);

    return () => clearInterval(interval);
  }, [pendingCount]);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  // Determine if we should show the offline banner
  const showOfflineBanner = (!isOnline || !isNostrConnected) && !isDismissed;

  // Show synced notification
  if (showSyncedNotification && lastSyncedCount > 0) {
    return (
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
        <div className="bg-terminal-text text-black px-4 py-2 rounded-sm shadow-hard flex items-center gap-2 text-sm font-bold">
          <Upload size={16} />
          <span>{lastSyncedCount} action{lastSyncedCount > 1 ? 's' : ''} synced</span>
        </div>
      </div>
    );
  }

  if (!showOfflineBanner) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-terminal-alert/95 text-black">
      <div className="max-w-[1174px] mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {!isOnline ? (
            <>
              <WifiOff size={18} className="flex-shrink-0" />
              <div className="text-sm">
                <span className="font-bold">YOU'RE OFFLINE.</span>
                <span className="ml-2 opacity-80">Actions will sync when reconnected.</span>
              </div>
            </>
          ) : !isNostrConnected ? (
            <>
              <CloudOff size={18} className="flex-shrink-0" />
              <div className="text-sm">
                <span className="font-bold">RELAY DISCONNECTED.</span>
                <span className="ml-2 opacity-80">Attempting to reconnect...</span>
              </div>
            </>
          ) : null}

          {pendingCount > 0 && (
            <div className="flex items-center gap-1 bg-black/20 px-2 py-0.5 rounded-sm text-xs">
              <RefreshCw size={12} className="animate-spin" />
              <span>{pendingCount} pending</span>
            </div>
          )}
        </div>

        <button
          onClick={handleDismiss}
          className="p-1 hover:bg-black/20 rounded-sm transition-colors"
          aria-label="Dismiss offline notification"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};
